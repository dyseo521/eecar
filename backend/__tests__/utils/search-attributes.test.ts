import { extractSearchAttributes } from '../../src/utils/search-attributes.js';
import { bm25Candidates, rankCandidates } from '../../src/utils/search-ranking.js';
import { Bm25Index } from '../../src/utils/search.js';
import { searchAttributesOf, SEARCH_DOCUMENT_VERSION } from '../../src/utils/search-document.js';

describe('extractSearchAttributes', () => {
  it('reads battery capacity from the name and health from batteryHealth', () => {
    const attrs = extractSearchAttributes({
      name: '현대 IONIQ 5 72.6kWh 배터리 팩',
      category: 'battery',
      price: 6_250_000,
      year: 2022,
      quantity: 2,
      condition: 'used',
      batteryHealth: { soh: 82 },
      specifications: { electricalProps: { voltage: 653, capacity: 111.1 } },
    });
    expect(attrs).toEqual({
      category: 'battery', kwh: 72.6, soh: 82, voltage: 653, price: 6_250_000, year: 2022, quantity: 2, condition: 'used',
    });
  });

  it('falls back to voltage x Ah when the name has no capacity', () => {
    const attrs = extractSearchAttributes({ name: '배터리 모듈', category: 'battery', specifications: { electricalProps: { voltage: 360, capacity: 100 } } });
    expect(attrs.kwh).toBe(36);
  });

  it('reads motor power, torque from the description, and tensile strength', () => {
    const motor = extractSearchAttributes({
      name: '후륜 구동모터',
      category: 'motor',
      description: '최고출력 160kW, 최대토크 350Nm.',
      specifications: { electricalProps: { power: 160 } },
    });
    expect(motor).toMatchObject({ powerKw: 160, torqueNm: 350 });
    expect(motor.kwh).toBeUndefined();
    const door = extractSearchAttributes({ name: '임팩트 빔', category: 'body-door', specifications: { materialComposition: { tensileStrengthMPa: 1500 } } });
    expect(door.tensileMPa).toBe(1500);
  });

  it('reads flat form specifications', () => {
    const attrs = extractSearchAttributes({ name: 'OBC', category: 'charger', specifications: { power: '11kW', voltage: '400V' } });
    expect(attrs).toMatchObject({ powerKw: 11, voltage: 400 });
  });

  it('omits unknown values', () => {
    expect(extractSearchAttributes({})).toEqual({});
  });
});

describe('searchAttributesOf', () => {
  it('uses stored attributes only when built with the current definition', () => {
    const stored = { searchAttributes: { kwh: 99 }, searchDocVersion: SEARCH_DOCUMENT_VERSION, name: '72kWh 배터리', category: 'battery' };
    expect(searchAttributesOf(stored)).toEqual({ kwh: 99 });
    expect(searchAttributesOf({ ...stored, searchDocVersion: 1 })).toMatchObject({ kwh: 72, category: 'battery' });
  });
});

describe('rankCandidates', () => {
  it('fuses both retrievers and demotes parts that violate the query conditions', () => {
    const docs = [
      { id: 'small', text: '스마트 배터리 팩 17.6kWh' },
      { id: 'big', text: '아이오닉5 배터리 팩 72kWh' },
      { id: 'hood', text: '아이오닉5 후드' },
    ];
    const attrs: Record<string, object> = {
      small: { category: 'battery', kwh: 17.6 },
      big: { category: 'battery', kwh: 72 },
      hood: { category: 'body-panel' },
    };
    const query = '60kWh 이상 배터리 팩';
    const index = Bm25Index.fromTexts(docs);
    // 목록이 짧으면 min-max에서 마지막 문서가 0점이 되므로, 벡터 목록 하단에 관련 없는 문서를 둔다
    const vector = [{ id: 'small', score: 0.9 }, { id: 'big', score: 0.6 }, { id: 'hood', score: 0.2 }];
    const ranked = rankCandidates(query, vector, bm25Candidates(index, query), id => attrs[id]);
    expect(ranked[0].id).toBe('big');
    expect(ranked[0].constraints.matched).toEqual(['카테고리', '용량 72kWh']);
    expect(ranked.find(h => h.id === 'small')?.constraints.mismatched).toEqual(['용량 17.6kWh']);
  });
});
