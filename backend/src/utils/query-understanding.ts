/**
 * 질의 이해: 검색어에서 부품 카테고리 의도와 수치·거래 조건을 뽑는다 (DECISION_LOG A-27).
 *
 * 텍스트 유사도는 "60kWh 이상", "500만원 이하"를 풀지 못하고, 차종 이름이 맞으면 카테고리가 달라도
 * 높은 점수를 준다("테슬라 모델3 모터" → 모델3 언더커버). 그래서 질의에서 조건을 뽑아
 * 부품 속성(search-attributes.ts)과 비교해 순위를 조정한다. 규칙은 도메인 어휘와 단위 표기에서 만들었다.
 * 뽑지 못한 조건은 무시한다(검색 결과가 없어지지 않도록 필터가 아니라 감점으로 쓴다).
 */
import type { SearchAttributes } from './search-attributes.js';
import { findAliasGroups, VEHICLE_ALIASES } from './search-vocabulary.js';

export type NumericField = 'kwh' | 'soh' | 'powerKw' | 'voltage' | 'torqueNm' | 'tensileMPa' | 'price' | 'year' | 'quantity';

export interface NumericConstraint {
  field: NumericField;
  op: 'gte' | 'lte';
  value: number;
}

export interface QueryConstraints {
  /** 질의가 가리키는 카테고리 후보 (하나라도 맞으면 만족) */
  categories: string[];
  numeric: NumericConstraint[];
  conditions: string[];
  /** 질의에 나온 차종 (표기 변형 묶음의 대표 표기). 하나라도 맞으면 만족 */
  vehicles?: string[];
}

export interface ParseOptions {
  /**
   * first: 먼저 맞은 규칙 하나 (v1.7.0)
   * all:   맞은 규칙 모두. 다른 매치 안에 들어 있는 짧은 매치는 버린다 ("임팩트 빔" 안의 "팩") (E-27 후보)
   */
  categoryMode?: 'first' | 'all';
  /** 질의의 차종을 조건으로 쓴다 (E-27 후보) */
  vehicles?: boolean;
}

/**
 * 구체적인 표현을 먼저 검사한다. "배터리 트레이"는 차체 프레임, "배터리 관리"는 전장,
 * "임팩트 빔"에는 "팩"이 들어 있으므로 배터리보다 먼저 본다. (JS 정규식의 \b는 한글에서 동작하지 않아 쓰지 않는다)
 */
const CATEGORY_RULES: Array<{ pattern: RegExp; categories: string[] }> = [
  { pattern: /배터리\s*(관리|매니지먼트)|BMS/i, categories: ['electronics'] },
  { pattern: /배터리\s*(트레이|케이스|하우징)/, categories: ['body-chassis-frame', 'other'] },
  { pattern: /도어|문짝|임팩트\s*빔/, categories: ['body-door'] },
  { pattern: /라이프\s*모듈|서브\s*프레임|크래시\s*빔|프레임|섀시|샤시|사이드\s*멤버/, categories: ['body-chassis-frame'] },
  { pattern: /VCU|LDC|PTC|히터|히트\s*펌프|정션\s*박스|컴프레서|전장/i, categories: ['electronics'] },
  { pattern: /OBC|충전기|충전\s*인렛|충전구|완속\s*충전|차징\s*포트/i, categories: ['charger'] },
  { pattern: /인버터|PE\s*모듈|파워\s*모듈/i, categories: ['inverter'] },
  { pattern: /모터|전동기|구동\s*장치/, categories: ['motor'] },
  { pattern: /배터리|이차\s*전지|kWh|SOH|ESS|셀\s*모듈|팩/i, categories: ['battery'] },
  { pattern: /후드|본넷|보닛|펜더|휀더|트렁크|루프\s*패널|사이드\s*실|패널|언더\s*커버|휠\s*아치/, categories: ['body-panel'] },
  { pattern: /유리|글라스|썬루프|선루프|윈드\s*실드|파노라마/, categories: ['body-window'] },
  { pattern: /대시\s*보드|시트|디스플레이|내장|트림/, categories: ['interior'] },
  { pattern: /휠/, categories: ['other'] },
];

// 천 단위 쉼표("1,500,000")와 소수("72.6")
const NUMBER = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)';
const GTE = '(이상|넘는|넘게|초과|부터|이후|최소)';
const LTE = '(이하|이내|미만|까지|안쪽|아래|넘지\\s*않는|이전|최대)';

function toNumber(text: string): number {
  return Number(text.replace(/,/g, ''));
}

function unitConstraints(query: string, field: NumericField, unit: string, scale = 1): NumericConstraint[] {
  const out: NumericConstraint[] = [];
  const re = new RegExp(`${NUMBER}\\s*${unit}\\s*(?:정도\\s*)?(?:${GTE}|${LTE})?`, 'gi');
  for (const m of query.matchAll(re)) {
    const value = toNumber(m[1]) * scale;
    if (m[2]) out.push({ field, op: 'gte', value });
    else if (m[3]) out.push({ field, op: 'lte', value });
  }
  return out;
}

function priceConstraints(query: string): NumericConstraint[] {
  const out: NumericConstraint[] = [];
  // "500만원 이하", "5백만원 이내", "1억 미만", "1,500,000원 이하"
  const re = new RegExp(`${NUMBER}\\s*(억|천만|백만|만)?\\s*원?\\s*(?:대\\s*)?(?:${GTE}|${LTE})`, 'g');
  const scale: Record<string, number> = { 억: 1e8, 천만: 1e7, 백만: 1e6, 만: 1e4 };
  for (const m of query.matchAll(re)) {
    const raw = toNumber(m[1]);
    const value = m[2] ? raw * scale[m[2]] : raw;
    // 단위 없는 숫자는 "원"이 붙고 1만 이상일 때만 가격으로 본다 ("2개 이상", "80% 이상"과 구분)
    if (!m[2] && !(/원/.test(m[0]) && value >= 10000)) continue;
    out.push({ field: 'price', op: m[3] ? 'gte' : 'lte', value });
  }
  return out;
}

function yearConstraints(query: string): NumericConstraint[] {
  // "2020년식 이후", "2021년 이상", "19년식 이전". 두 자리는 식·형이 붙을 때만 ("10년 이상 사용"은 연식이 아님)
  const out: NumericConstraint[] = [];
  const patterns = [
    new RegExp(`(20\\d{2})\\s*년\\s*(?:식|형|산)?\\s*(?:${GTE}|${LTE})`, 'g'),
    new RegExp(`(?<!\\d)([12]\\d)\\s*년\\s*(?:식|형)\\s*(?:${GTE}|${LTE})`, 'g'),
  ];
  for (const re of patterns) {
    for (const m of query.matchAll(re)) {
      const year = m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]);
      out.push({ field: 'year', op: m[2] ? 'gte' : 'lte', value: year });
    }
  }
  return out;
}

function sohConstraints(query: string, isBattery: boolean): NumericConstraint[] {
  // "SOH 80% 이상", "잔존 용량 70% 넘는", "건강도 90 이상". 배터리 질의에서는 라벨 없는 "80% 이상"도 SOH로 본다
  const out: NumericConstraint[] = [];
  const labeled = new RegExp(`(?:SOH|잔존\\s*용량|건강도|잔존율|수명)[^\\d]{0,6}${NUMBER}\\s*%?\\s*(?:${GTE}|${LTE})`, 'gi');
  for (const m of query.matchAll(labeled)) {
    out.push({ field: 'soh', op: m[2] ? 'gte' : 'lte', value: toNumber(m[1]) });
  }
  if (out.length === 0 && isBattery) {
    const bare = new RegExp(`${NUMBER}\\s*%\\s*(?:${GTE}|${LTE})`, 'g');
    for (const m of query.matchAll(bare)) out.push({ field: 'soh', op: m[2] ? 'gte' : 'lte', value: toNumber(m[1]) });
  }
  return out;
}

const CONDITION_RULES: Array<{ pattern: RegExp; condition: string }> = [
  { pattern: /리퍼|재생품|재제조|refurb/i, condition: 'refurbished' },
  { pattern: /고장|부품용|폐부품|파손품|for[-\s]?parts/i, condition: 'for-parts' },
  { pattern: /신품|새\s*제품|미사용|새것/, condition: 'new' },
];

function matchCategories(query: string, mode: 'first' | 'all'): string[] {
  if (mode === 'first') return CATEGORY_RULES.find(rule => rule.pattern.test(query))?.categories ?? [];
  const spans = CATEGORY_RULES.flatMap(rule => {
    const m = rule.pattern.exec(query);
    return m ? [{ start: m.index, end: m.index + m[0].length, categories: rule.categories }] : [];
  });
  const kept = spans.filter(a => !spans.some(b => b !== a && b.start <= a.start && a.end <= b.end && b.end - b.start > a.end - a.start));
  return [...new Set(kept.flatMap(s => s.categories))];
}

/** 차종 표기 변형 묶음의 대표 표기 (search-vocabulary.ts) */
export function vehicleGroupsOf(text: string): string[] {
  return findAliasGroups(text, VEHICLE_ALIASES).map(group => group[0]);
}

export function parseQuery(query: string, options: ParseOptions = {}): QueryConstraints {
  const categories = matchCategories(query, options.categoryMode ?? 'first');
  const categoryRule = categories.length ? { categories } : undefined;
  const numeric = [
    ...unitConstraints(query, 'kwh', 'kWh'),
    ...unitConstraints(query, 'powerKw', 'kW(?!h)'),
    ...unitConstraints(query, 'torqueNm', '(?:Nm|N·m|뉴턴미터)'),
    ...unitConstraints(query, 'tensileMPa', 'MPa'),
    ...unitConstraints(query, 'quantity', '(?:개|대|세트|EA|ea)'),
    ...priceConstraints(query),
    ...yearConstraints(query),
    ...sohConstraints(query, categoryRule?.categories.includes('battery') ?? false),
  ];
  const vehicles = options.vehicles ? vehicleGroupsOf(query) : [];
  return {
    categories,
    numeric,
    conditions: CONDITION_RULES.filter(rule => rule.pattern.test(query)).map(rule => rule.condition),
    ...(vehicles.length ? { vehicles } : {}),
  };
}

export interface ConstraintCheck {
  /** 확인한 조건 수 (부품에 값이 없어 확인하지 못한 조건은 세지 않는다) */
  checked: number;
  /** 위반한 조건 수 (차종 제외) */
  violated: number;
  /** 차종 조건 위반 (0 또는 1). 차종은 다른 조건보다 약하게 감점한다 (E-27) */
  vehicleViolated?: number;
  matched: string[];
  mismatched: string[];
}

const FIELD_LABELS: Record<NumericField, [string, string]> = {
  kwh: ['용량', 'kWh'],
  soh: ['SOH', '%'],
  powerKw: ['출력', 'kW'],
  voltage: ['전압', 'V'],
  torqueNm: ['토크', 'Nm'],
  tensileMPa: ['인장강도', 'MPa'],
  price: ['가격', '원'],
  year: ['연식', '년'],
  quantity: ['재고', '개'],
};

function describe(field: NumericField, value: number): string {
  const [label, unit] = FIELD_LABELS[field];
  if (field === 'price') return `${label} ${Math.round(value / 10000).toLocaleString('ko-KR')}만원`;
  return `${label} ${value}${unit}`;
}

/** 부품 속성이 질의 조건을 얼마나 만족하는지. 값이 없는 조건은 판단하지 않는다 */
export function checkConstraints(attrs: SearchAttributes, constraints: QueryConstraints): ConstraintCheck {
  const result: ConstraintCheck = { checked: 0, violated: 0, matched: [], mismatched: [] };
  if (constraints.categories.length > 0 && attrs.category) {
    result.checked++;
    if (constraints.categories.includes(attrs.category)) result.matched.push('카테고리');
    else {
      result.violated++;
      result.mismatched.push('카테고리');
    }
  }
  for (const c of constraints.numeric) {
    const value = attrs[c.field];
    if (typeof value !== 'number') continue;
    result.checked++;
    const ok = c.op === 'gte' ? value >= c.value : value <= c.value;
    (ok ? result.matched : result.mismatched).push(describe(c.field, value));
    if (!ok) result.violated++;
  }
  if (constraints.conditions.length > 0 && attrs.condition) {
    result.checked++;
    if (constraints.conditions.includes(attrs.condition)) result.matched.push('상태');
    else {
      result.violated++;
      result.mismatched.push('상태');
    }
  }
  if (constraints.vehicles?.length && attrs.vehicles?.length) {
    result.checked++;
    if (constraints.vehicles.some(v => attrs.vehicles!.includes(v))) result.matched.push('차종');
    else {
      result.vehicleViolated = 1;
      result.mismatched.push(`차종 ${attrs.vehicles.join('/')}`);
    }
  }
  return result;
}

/** 조건 위반 1개당 점수 배율 (1 − 감점). 값은 v2 dev 질의에서 선택한다 (DECISION_LOG A-27) */
export const CONSTRAINT_PENALTY = 0.8;
/**
 * 차종 위반 감점. 카테고리 위반과 같게(0.8) 주면 "다른 차종의 같은 부품"이 "같은 차종의 다른 부품"보다 밀려
 * dev nDCG가 떨어졌다(0.878 → 0.861). 구매자에게는 전자가 차선책이므로 더 약하게 준다 (E-27)
 */
export const VEHICLE_PENALTY = 0.3;

export type ConstraintScope = 'all' | 'category' | 'numeric' | 'vehicle';

/** 조건 범위를 줄인다 (실험에서 카테고리·수치 조건의 효과를 따로 보기 위함) */
export function scopeConstraints(constraints: QueryConstraints, scope: ConstraintScope): QueryConstraints {
  if (scope === 'category') return { categories: constraints.categories, numeric: [], conditions: [] };
  if (scope === 'numeric') return { categories: [], numeric: constraints.numeric, conditions: constraints.conditions };
  if (scope === 'vehicle') return { categories: [], numeric: [], conditions: [], vehicles: constraints.vehicles };
  return constraints;
}

/**
 * 질의 조건을 위반한 부품의 점수를 낮춰 다시 정렬한다. 필터가 아니라 감점이라 결과가 비지 않는다.
 * 부품 속성이 없어 확인하지 못한 조건은 감점하지 않는다.
 */
export function rerankByConstraints<T extends { id: string; score: number }>(
  hits: T[],
  attrsOf: (id: string) => SearchAttributes | undefined,
  constraints: QueryConstraints,
  penalty: number = CONSTRAINT_PENALTY,
  vehiclePenalty: number = VEHICLE_PENALTY
): Array<T & { constraints: ConstraintCheck }> {
  return hits
    .map(hit => {
      const check = checkConstraints(attrsOf(hit.id) ?? {}, constraints);
      const factor = Math.pow(1 - penalty, check.violated) * Math.pow(1 - vehiclePenalty, check.vehicleViolated ?? 0);
      return { ...hit, score: hit.score * factor, constraints: check };
    })
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
}
