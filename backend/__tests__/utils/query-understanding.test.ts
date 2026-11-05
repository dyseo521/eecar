import {
  checkConstraints,
  parseQuery,
  rerankByConstraints,
  scopeConstraints,
} from '../../src/utils/query-understanding.js';

describe('parseQuery', () => {
  it('detects the category intent', () => {
    expect(parseQuery('테슬라 모델3 모터').categories).toEqual(['motor']);
    expect(parseQuery('ESS용 배터리').categories).toEqual(['battery']);
    expect(parseQuery('코나 OBC').categories).toEqual(['charger']);
    expect(parseQuery('니로 BMS 보드').categories).toEqual(['electronics']);
    expect(parseQuery('BMW i3 휠 아치 라이너').categories).toEqual(['body-panel']);
    expect(parseQuery('모델Y 앞유리').categories).toEqual(['body-window']);
    expect(parseQuery('알로이 휠').categories).toEqual(['other']);
    expect(parseQuery('아무 부품').categories).toEqual([]);
  });

  it('checks specific phrases before generic ones', () => {
    // "임팩트 빔"에는 "팩"이 들어 있다
    expect(parseQuery('아이오닉5 도어 임팩트 빔').categories).toEqual(['body-door']);
    expect(parseQuery('배터리 트레이').categories).toEqual(['body-chassis-frame', 'other']);
    expect(parseQuery('배터리 관리 시스템').categories).toEqual(['electronics']);
  });

  it('reads capacity, power, torque and tensile strength ranges', () => {
    expect(parseQuery('60kWh 이상 배터리').numeric).toEqual([{ field: 'kwh', op: 'gte', value: 60 }]);
    expect(parseQuery('72.6 kWh 이하').numeric).toEqual([{ field: 'kwh', op: 'lte', value: 72.6 }]);
    expect(parseQuery('150kW 이상 모터').numeric).toEqual([{ field: 'powerKw', op: 'gte', value: 150 }]);
    expect(parseQuery('토크 300Nm 이상').numeric).toEqual([{ field: 'torqueNm', op: 'gte', value: 300 }]);
    expect(parseQuery('1000MPa 이상 강판').numeric).toEqual([{ field: 'tensileMPa', op: 'gte', value: 1000 }]);
  });

  it('ignores numbers without a direction', () => {
    expect(parseQuery('72kWh 배터리').numeric).toEqual([]);
  });

  it('reads prices with Korean units and thousand separators', () => {
    expect(parseQuery('500만원 이하 배터리').numeric).toEqual([{ field: 'price', op: 'lte', value: 5_000_000 }]);
    expect(parseQuery('5백만원 이내').numeric).toEqual([{ field: 'price', op: 'lte', value: 5_000_000 }]);
    expect(parseQuery('1억 미만').numeric).toEqual([{ field: 'price', op: 'lte', value: 100_000_000 }]);
    expect(parseQuery('1,500,000원 이하 OBC').numeric).toEqual([{ field: 'price', op: 'lte', value: 1_500_000 }]);
    expect(parseQuery('300만원 이상').numeric).toEqual([{ field: 'price', op: 'gte', value: 3_000_000 }]);
  });

  it('reads model years but not durations', () => {
    expect(parseQuery('2020년식 이후 인버터').numeric).toEqual([{ field: 'year', op: 'gte', value: 2020 }]);
    expect(parseQuery('19년식 이전 리프').numeric).toEqual([{ field: 'year', op: 'lte', value: 2019 }]);
    expect(parseQuery('10년 이상 사용한 모터').numeric).toEqual([]);
  });

  it('reads SOH with or without a label in battery queries', () => {
    expect(parseQuery('SOH 80% 이상 배터리').numeric).toEqual([{ field: 'soh', op: 'gte', value: 80 }]);
    expect(parseQuery('잔존 용량 70 넘는 팩').numeric).toEqual([{ field: 'soh', op: 'gte', value: 70 }]);
    expect(parseQuery('리프 배터리 80% 이상').numeric).toEqual([{ field: 'soh', op: 'gte', value: 80 }]);
    // 배터리 질의가 아니면 라벨 없는 %는 SOH로 보지 않는다
    expect(parseQuery('효율 95% 이상 인버터').numeric).toEqual([]);
  });

  it('reads quantities and conditions', () => {
    expect(parseQuery('2개 이상 재고 있는 모터').numeric).toEqual([{ field: 'quantity', op: 'gte', value: 2 }]);
    expect(parseQuery('리퍼 OBC').conditions).toEqual(['refurbished']);
    expect(parseQuery('고장품 모터 부품용').conditions).toEqual(['for-parts']);
    expect(parseQuery('미사용 신품 배터리').conditions).toEqual(['new']);
  });
});

describe('checkConstraints', () => {
  const constraints = parseQuery('500만원 이하 SOH 80% 이상 배터리');

  it('counts matched and violated conditions', () => {
    const check = checkConstraints({ category: 'battery', soh: 75, price: 4_000_000 }, constraints);
    expect(check).toEqual({ checked: 3, violated: 1, matched: ['카테고리', '가격 400만원'], mismatched: ['SOH 75%'] });
  });

  it('does not judge conditions whose value is unknown', () => {
    expect(checkConstraints({ category: 'battery' }, constraints)).toMatchObject({ checked: 1, violated: 0 });
  });

  it('flags a different category and condition', () => {
    const check = checkConstraints({ category: 'motor', condition: 'used' }, parseQuery('리퍼 배터리'));
    expect(check.mismatched).toEqual(['카테고리', '상태']);
  });

  it('describes each field with its unit', () => {
    const check = checkConstraints(
      { kwh: 72, powerKw: 150, torqueNm: 350, tensileMPa: 1500, year: 2021, quantity: 3, voltage: 800 },
      parseQuery('60kWh 이상 150kW 이상 300Nm 이상 1000MPa 이상 2020년식 이후 2개 이상')
    );
    expect(check.matched).toEqual(['용량 72kWh', '출력 150kW', '토크 350Nm', '인장강도 1500MPa', '재고 3개', '연식 2021년']);
  });
});

describe('rerankByConstraints', () => {
  const attrs: Record<string, { category: string; kwh?: number }> = {
    a: { category: 'battery', kwh: 17.6 },
    b: { category: 'battery', kwh: 72 },
    c: { category: 'body-panel' },
  };
  const hits = [{ id: 'c', score: 0.9 }, { id: 'a', score: 0.8 }, { id: 'b', score: 0.6 }];

  it('demotes parts that violate the query conditions', () => {
    const ranked = rerankByConstraints(hits, id => attrs[id], parseQuery('ESS용 60kWh 이상 배터리'), 0.8);
    expect(ranked.map(h => h.id)).toEqual(['b', 'c', 'a']);
    expect(ranked[0].score).toBeCloseTo(0.6);
    expect(ranked[1].score).toBeCloseTo(0.18);
  });

  it('keeps every hit (penalty, not a filter) and handles unknown attributes', () => {
    const ranked = rerankByConstraints(hits, () => undefined, parseQuery('60kWh 이상 배터리'), 1);
    expect(ranked.map(h => h.id)).toEqual(['c', 'a', 'b']);
  });

  it('can limit the constraints to category or numeric ones', () => {
    const c = parseQuery('리퍼 60kWh 이상 배터리');
    expect(scopeConstraints(c, 'category')).toEqual({ categories: ['battery'], numeric: [], conditions: [] });
    expect(scopeConstraints(c, 'numeric')).toEqual({ categories: [], numeric: c.numeric, conditions: ['refurbished'] });
    expect(scopeConstraints(c, 'all')).toBe(c);
  });
});

describe('parse options (E-27)', () => {
  it('collects every category but drops matches inside longer ones', () => {
    expect(parseQuery('테슬라 후륜 모터랑 인버터 세트', { categoryMode: 'all' }).categories.sort()).toEqual(['inverter', 'motor']);
    expect(parseQuery('사이드 유리 도어 글라스', { categoryMode: 'all' }).categories.sort()).toEqual(['body-door', 'body-window']);
    // "임팩트 빔" 안의 "팩", "배터리 트레이" 안의 "배터리"는 버린다
    expect(parseQuery('아이오닉5 도어 임팩트 빔', { categoryMode: 'all' }).categories).toEqual(['body-door']);
    expect(parseQuery('배터리 트레이', { categoryMode: 'all' }).categories).toEqual(['body-chassis-frame', 'other']);
  });

  it('extracts vehicles only when asked', () => {
    expect(parseQuery('아이오닉5 배터리 팩').vehicles).toBeUndefined();
    expect(parseQuery('아이오닉5 배터리 팩', { vehicles: true }).vehicles).toEqual(['아이오닉5']);
    expect(parseQuery('코나EV나 니로EV 모터', { vehicles: true }).vehicles).toEqual(['코나 일렉트릭', '니로 EV']);
  });

  it('demotes another vehicle less than another category', () => {
    const constraints = parseQuery('아이오닉5 배터리', { vehicles: true });
    const attrs: Record<string, object> = {
      sameVehicleDoor: { category: 'body-door', vehicles: ['아이오닉5'] },
      otherVehicleBattery: { category: 'battery', vehicles: ['아이오닉 일렉트릭'] },
    };
    const hits = [{ id: 'sameVehicleDoor', score: 1 }, { id: 'otherVehicleBattery', score: 1 }];
    const ranked = rerankByConstraints(hits, id => attrs[id], constraints, 0.8, 0.3);
    expect(ranked.map(h => h.id)).toEqual(['otherVehicleBattery', 'sameVehicleDoor']);
    expect(ranked[0].score).toBeCloseTo(0.7);
    expect(ranked[0].constraints.mismatched).toEqual(['차종 아이오닉 일렉트릭']);
    expect(ranked[1].score).toBeCloseTo(0.2);
  });

  it('scopes to vehicle constraints', () => {
    const c = parseQuery('아이오닉5 60kWh 이상 배터리', { vehicles: true });
    expect(scopeConstraints(c, 'vehicle')).toEqual({ categories: [], numeric: [], conditions: [], vehicles: ['아이오닉5'] });
  });
});
