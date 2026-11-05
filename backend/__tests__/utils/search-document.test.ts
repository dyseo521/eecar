/**
 * 검색 문서 정의 테스트. 이전에는 색인 경로마다 다른 필드를 읽어 정보가 조용히 빠졌다 (C-21).
 */
import {
  buildEmbeddingText,
  buildSearchText,
  searchTextOf,
  SEARCH_DOCUMENT_VERSION,
} from '../../src/utils/search-document.js';
import { findAliasGroups, MAKER_ALIASES, VEHICLE_ALIASES } from '../../src/utils/search-vocabulary.js';

const battery = {
  name: '현대 IONIQ 5 72.6kWh 배터리 팩',
  category: 'battery',
  manufacturer: 'SK온',
  model: 'IONIQ 5 72.6kWh',
  year: 2022,
  condition: 'used',
  price: 6_250_000,
  quantity: 3,
  description: '폐차 차량에서 회수한 배터리 팩',
  batteryHealth: {
    soh: 82,
    cathodeType: 'NCM Ni 80%',
    cycleCount: 640,
    estimatedMileageKm: 310,
    recommendedUse: 'reuse',
    suitableApplications: ['ESS', 'UPS'],
  },
  specifications: { electricalProps: { voltage: 653, capacity: 111.1 }, weight: 430 },
};

describe('buildSearchText', () => {
  it('includes trade conditions buyers search for', () => {
    const text = buildSearchText(battery);
    expect(text).toContain('연식: 2022년');
    expect(text).toContain('상태: 중고');
    expect(text).toContain('가격: 625만원');
    expect(text).toContain('재고: 3개');
  });

  it('reads the battery fields that the data actually uses (cycleCount, estimatedMileageKm)', () => {
    const text = buildSearchText(battery);
    expect(text).toContain('충방전: 640회');
    expect(text).toContain('예상 주행거리: 310km');
    expect(text).toContain('권장 용도: 재사용');
    expect(text).toContain('적합 용도: ESS, UPS');
    expect(text).toContain('양극재: NCM Ni 80% (삼원계 하이니켈)');
  });

  it('names cathode families', () => {
    const text = (cathodeType: string) => buildSearchText({ name: 'x', batteryHealth: { soh: 90, cathodeType } });
    expect(text('LFP')).toContain('리튬인산철');
    expect(text('LMFP')).toContain('리튬망간인산철');
    expect(text('NCM Ni 60%')).toContain('(삼원계)');
    expect(text('NCA')).toContain('삼원계 NCA');
    expect(text('LMO')).toContain('리튬망간');
    expect(text('LTO')).toContain('양극재: LTO');
  });

  it('labels category codes in Korean', () => {
    expect(buildSearchText({ name: 'x', category: 'body-door' })).toContain('카테고리: 도어 (body-door)');
    expect(buildSearchText({ name: 'x', category: 'polymer' })).toContain('폴리머 소재');
  });

  it('reads flat specifications sent by the registration form', () => {
    const text = buildSearchText({
      name: '배터리',
      category: 'battery',
      specifications: { voltage: '400V', chemistry: 'LFP', cycles: '2000 cycles' },
    });
    expect(text).toContain('전압: 400V');
    expect(text).toContain('셀 종류: LFP');
    expect(text).toContain('충방전 사이클: 2000 cycles');
  });

  it('reads tensileStrengthMPa from material composition', () => {
    const text = buildSearchText({
      name: '도어 빔',
      category: 'body-door',
      specifications: { materialComposition: { primary: '핫스탬핑강', alloyNumber: 'HPF1500', tensileStrengthMPa: 1500 } },
    });
    expect(text).toContain('재질: 핫스탬핑강');
    expect(text).toContain('합금: HPF1500');
    expect(text).toContain('인장강도: 1500MPa');
  });

  it('does not add category-wide keywords that may be false for the part', () => {
    const text = buildSearchText({ name: '아이오닉 5 구동 인버터 (SiC)', category: 'inverter', manufacturer: '현대모비스' });
    expect(text).not.toContain('IGBT');
    const motor = buildSearchText({ name: '유도 모터', category: 'motor', description: 'Model S 유도 모터' });
    expect(motor).not.toContain('PMSM');
  });

  it('appends spelling variants of the vehicle and maker', () => {
    const text = buildSearchText(battery);
    expect(text).toContain('다른 표기:');
    expect(text).toContain('아이오닉5');
    expect(text).toContain('SK On');
    expect(buildSearchText(battery, { aliases: false })).not.toContain('다른 표기');
  });

  it('can omit trade lines', () => {
    const text = buildSearchText(battery, { trade: false });
    expect(text).not.toContain('가격');
    expect(text).not.toContain('재고');
    expect(text).toContain('SOH: 82%');
  });

  it('formats prices under 10,000 won without the 만원 unit', () => {
    expect(buildSearchText({ name: 'x', price: 9000 })).toContain('가격: 9000원');
  });

  it('includes use cases', () => {
    const text = buildSearchText({ name: 'x', useCases: [{ industry: '에너지', application: 'ESS' }, {}] });
    expect(text).toContain('활용: 에너지 - ESS');
  });

  it('handles an empty part', () => {
    expect(buildSearchText({})).toBe('');
  });
});

describe('buildEmbeddingText', () => {
  it('is the search document without trade lines', () => {
    expect(buildEmbeddingText(battery)).toBe(buildSearchText(battery, { trade: false }));
  });
});

describe('searchTextOf', () => {
  it('uses the stored search text when it was built with the current definition', () => {
    const item = { name: '배터리', searchText: '저장된 문서', searchDocVersion: SEARCH_DOCUMENT_VERSION };
    expect(searchTextOf(item)).toBe('저장된 문서');
  });

  it('rebuilds the text when the stored version is old or missing', () => {
    expect(searchTextOf({ name: '배터리', searchText: '옛 문서', searchDocVersion: 1 })).toContain('배터리');
    expect(searchTextOf({ name: '배터리' })).toBe(buildSearchText({ name: '배터리' }));
  });
});

describe('findAliasGroups', () => {
  const groupOf = (text: string) => findAliasGroups(text, VEHICLE_ALIASES).map(g => g[0]);

  it('matches spelling variants regardless of spacing and script', () => {
    expect(groupOf('현대 아이오닉 5 배터리')).toEqual(['아이오닉5']);
    expect(groupOf('IONIQ5 배터리')).toEqual(['아이오닉5']);
    expect(groupOf('SM3 Z.E. 모터')).toEqual(['SM3 Z.E.']);
  });

  it('matches a variant followed by a particle', () => {
    expect(groupOf('IONIQ 5용 배터리 팩')).toEqual(['아이오닉5']);
  });

  it('does not match inside a longer word', () => {
    expect(groupOf('차량용 리프트 장비')).toEqual([]);
  });

  it('does not treat a bare ambiguous word as a vehicle', () => {
    // 볼트 = 체결 부품. 차종 볼트는 "볼트 EV"처럼 붙은 표기만 인식한다
    expect(groupOf('휠 볼트 세트')).toEqual([]);
    expect(groupOf('볼트 EV 배터리')).toEqual(['볼트 EV']);
  });

  it('does not match a maker whose name is a prefix of another maker', () => {
    const makers = findAliasGroups('현대모비스 인버터', MAKER_ALIASES).map(g => g[0]);
    expect(makers).toEqual(['현대모비스']);
  });
});
