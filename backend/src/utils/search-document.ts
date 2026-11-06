/**
 * 검색 문서: 부품 하나를 검색용 텍스트로 바꾸는 단일 정의.
 *
 * 임베딩(등록·재색인), BM25(검색 시점), 평가가 모두 이 함수를 쓴다. 이전에는 경로마다 다른 함수가
 * 다른 필드를 읽어 정보가 조용히 빠졌다(기술 도전 C-21, DECISION_LOG A-21).
 * - 임베딩 텍스트는 batteryHealth.cycles·predictedRange를 읽었지만 실제 필드는 cycleCount·estimatedMileageKm
 * - 등록 폼의 평평한 사양({ voltage: '400V' })은 중첩 구조만 읽는 코드에서 통째로 무시됨
 * - 가격·연식·수량·상태가 어느 텍스트에도 없었음
 * - 카테고리 단위 고정 키워드가 사실과 다른 정보를 넣음 (SiC 인버터에 IGBT, 유도 모터에 PMSM)
 *
 * 원칙
 * - 부품 데이터에서 나온 사실만 넣는다.
 * - 코드값은 한국어 표기와 함께 넣는다 (battery → 배터리).
 * - 저장 형태가 달라도 같은 문서가 나온다 (중첩 사양과 평평한 사양 모두 읽음).
 */
import { findAliasGroups, MAKER_ALIASES, VEHICLE_ALIASES } from './search-vocabulary.js';
import { extractSearchAttributes, SearchAttributes } from './search-attributes.js';

/** 검색 문서 정의가 바뀌면 올린다. 저장된 searchText·임베딩이 어느 정의로 만들어졌는지 구분한다 */
export const SEARCH_DOCUMENT_VERSION = 5; // 3: searchAttributes (A-27), 4: 차종 (E-27), 5: 운영 차종 사전 보강 (A-32)

/** 저장된 searchText가 현재 정의로 만들어졌는지 확인할 때 쓰는 METADATA 속성 이름 */
export const SEARCH_TEXT_ATTRIBUTE = 'searchText';
export const SEARCH_DOC_VERSION_ATTRIBUTE = 'searchDocVersion';
export const SEARCH_ATTRIBUTES_ATTRIBUTE = 'searchAttributes';

const CATEGORY_LABELS: Record<string, string> = {
  battery: '배터리',
  motor: '구동 모터',
  inverter: '인버터',
  charger: '충전기',
  electronics: '전장 부품',
  body: '차체',
  'body-chassis-frame': '차체 프레임',
  'body-panel': '차체 패널',
  'body-door': '도어',
  'body-window': '차량 유리',
  interior: '내장재',
  polymer: '폴리머 소재',
  other: '기타',
};

const CONDITION_LABELS: Record<string, string> = {
  new: '신품',
  'like-new': '신품급',
  excellent: '최상',
  good: '양호',
  used: '중고',
  fair: '보통',
  poor: '불량',
  refurbished: '리퍼비시(재생)',
  'for-parts': '부품용(고장품)',
};

const RECOMMENDED_USE_LABELS: Record<string, string> = {
  reuse: '재사용',
  refurbish: '재제조',
  recycle: '재활용',
  dispose: '폐기',
};

/** 양극재 계열의 한국어 이름 (화학 조성에서 나오는 사실) */
function cathodeFamily(cathode: unknown): string | undefined {
  // 문자열이 아닌 값이 들어오면 예외로 전체 색인 적재가 실패했다 (A-41)
  if (typeof cathode !== 'string') return undefined;
  const c = cathode.toUpperCase();
  if (c.startsWith('NCM') || c.startsWith('NMC')) {
    const ni = Number(/NI\s*(\d+)/.exec(c)?.[1]);
    return ni >= 80 ? '삼원계 하이니켈' : '삼원계';
  }
  if (c.startsWith('NCA')) return '삼원계 NCA';
  if (c.startsWith('LMFP')) return '리튬망간인산철';
  if (c.startsWith('LFP')) return '리튬인산철';
  if (c.startsWith('LMO')) return '리튬망간';
  return undefined;
}

/** 등록 폼의 평평한 사양 키 (frontend/src/constants/formConstants.ts) */
const FLAT_SPEC_LABELS: Record<string, string> = {
  voltage: '전압',
  capacity: '용량',
  chemistry: '셀 종류',
  soc: 'SOC',
  cycles: '충방전 사이클',
  weight: '중량',
  power: '출력',
  torque: '토크',
  rpm: '최대 RPM',
  cooling: '냉각 방식',
  phases: '상',
  efficiency: '효율',
  current: '최대 전류',
  type: '타입',
  material: '재질',
  dimensions: '치수',
  // 운영 데이터 SPEC 항목에 있는 키
  energyDensity: '에너지 밀도',
  chargingRate: '충전 속도',
  coolingType: '냉각 방식',
  switchingFrequency: '스위칭 주파수',
};

function isPrimitive(value: unknown): value is string | number | boolean {
  return ['string', 'number', 'boolean'].includes(typeof value);
}

function won(price: number): string {
  return price >= 10000 ? `${Math.round(price / 10000).toLocaleString('ko-KR')}만원` : `${price}원`;
}

function specLines(spec: any): string[] {
  if (!spec || typeof spec !== 'object') return [];
  const lines: string[] = [];
  const e = spec.electricalProps;
  if (e) {
    if (e.voltage) lines.push(`전압: ${e.voltage}V`);
    if (e.capacity) lines.push(`용량: ${e.capacity}Ah`);
    if (e.power) lines.push(`출력: ${e.power}kW`);
    if (e.currentRating) lines.push(`정격 전류: ${e.currentRating}A`);
  }
  const m = spec.materialComposition;
  if (m) {
    const items = [m.primary, ...(Array.isArray(m.secondary) ? m.secondary : [])].filter(Boolean);
    if (items.length) lines.push(`재질: ${items.join(', ')}`);
    if (m.alloyNumber) lines.push(`합금: ${m.alloyNumber}`);
    const tensile = m.tensileStrengthMPa ?? m.tensileStrength;
    if (tensile) lines.push(`인장강도: ${tensile}MPa`);
    if (m.recyclability) lines.push(`재활용률: ${m.recyclability}%`);
  }
  const d = spec.dimensions;
  if (d && typeof d === 'object' && (d.length || d.width || d.height)) {
    lines.push(`크기: ${d.length || 0}x${d.width || 0}x${d.height || 0}mm`);
  }
  if (typeof spec.weight === 'number') lines.push(`중량: ${spec.weight}kg`);
  // 등록 폼에서 온 평평한 사양: 값이 문자열·숫자인 항목을 그대로 적는다
  for (const [key, value] of Object.entries(spec)) {
    if (key === 'weight' && typeof value === 'number') continue;
    if (key === 'PK' || key === 'SK' || !isPrimitive(value) || value === '') continue;
    lines.push(`${FLAT_SPEC_LABELS[key] ?? key}: ${value}`);
  }
  return lines;
}

function batteryLines(b: any): string[] {
  if (!b || typeof b !== 'object') return [];
  const lines: string[] = [];
  if (b.soh !== undefined) lines.push(`SOH: ${b.soh}%`);
  if (b.cathodeType) {
    const family = cathodeFamily(b.cathodeType);
    lines.push(`양극재: ${b.cathodeType}${family ? ` (${family})` : ''}`);
  }
  if (b.manufacturer) lines.push(`셀 제조사: ${b.manufacturer}`);
  if (b.cycleCount !== undefined) lines.push(`충방전: ${b.cycleCount}회`);
  if (b.estimatedMileageKm !== undefined) lines.push(`예상 주행거리: ${b.estimatedMileageKm}km`);
  if (b.recommendedUse) lines.push(`권장 용도: ${RECOMMENDED_USE_LABELS[b.recommendedUse] ?? b.recommendedUse}`);
  if (Array.isArray(b.suitableApplications) && b.suitableApplications.length) {
    lines.push(`적합 용도: ${b.suitableApplications.join(', ')}`);
  }
  return lines;
}

export interface SearchDocumentOptions {
  /** 차종·제조사 표기 변형을 문서에 덧붙인다 (search-vocabulary.ts) */
  aliases?: boolean;
  /** 거래 조건(연식·상태·가격·재고) 줄을 넣는다 */
  trade?: boolean;
}

export function buildSearchText(part: any, options: SearchDocumentOptions = {}): string {
  const { aliases = true, trade = true } = options;
  const lines: string[] = [];
  if (part.name) lines.push(part.name);
  if (part.category) lines.push(`카테고리: ${CATEGORY_LABELS[part.category] ?? part.category} (${part.category})`);
  if (part.manufacturer) lines.push(`제조사: ${part.manufacturer}`);
  if (part.vehicleBrand) lines.push(`차량 브랜드: ${part.vehicleBrand}`);
  if (part.model) lines.push(`모델: ${part.model}`);
  if (trade) {
    if (part.year) lines.push(`연식: ${part.year}년`);
    if (part.condition) lines.push(`상태: ${CONDITION_LABELS[part.condition] ?? part.condition}`);
    if (typeof part.price === 'number') lines.push(`가격: ${won(part.price)}`);
    if (typeof part.quantity === 'number') lines.push(`재고: ${part.quantity}개`);
  }
  lines.push(...batteryLines(part.batteryHealth));
  lines.push(...specLines(part.specifications));
  if (part.description) lines.push(part.description);
  if (Array.isArray(part.useCases)) {
    for (const u of part.useCases) {
      const head = [u?.industry, u?.application].filter(Boolean).join(' - ');
      if (head) lines.push(`활용: ${head}`);
    }
  }

  if (aliases) {
    const source = [part.name, part.model, part.manufacturer, part.vehicleBrand, part.batteryHealth?.manufacturer]
      .filter(Boolean)
      .join(' ');
    const groups = [...findAliasGroups(source, VEHICLE_ALIASES), ...findAliasGroups(source, MAKER_ALIASES)];
    if (groups.length) lines.push(`다른 표기: ${[...new Set(groups.flat())].join(', ')}`);
  }
  return lines.join('\n');
}

/**
 * 임베딩용 문서 텍스트: 검색 문서에서 거래 조건 줄(연식·상태·가격·재고)을 뺀 것.
 * 모든 문서에 같은 형태로 들어가는 줄이 문서 벡터를 서로 비슷하게 만들어, 넣으면 벡터 검색 nDCG@10이
 * 0.686 → 0.661로 떨어졌다 (v2 test, DECISION_LOG E-23). 거래 조건은 BM25와 필터가 맡는다.
 */
export function buildEmbeddingText(part: any): string {
  return buildSearchText(part, { trade: false });
}

/**
 * METADATA 항목의 BM25 텍스트. 등록·재색인 때 전체 레코드(SPEC·배터리 상태·활용 사례 포함)로 만들어 저장한
 * searchText를 쓰고, 없거나 정의 버전이 다르면 METADATA만으로 다시 만든다 (사양이 빠질 수 있음).
 */
export function searchTextOf(item: any): string {
  if (typeof item[SEARCH_TEXT_ATTRIBUTE] === 'string' && item[SEARCH_DOC_VERSION_ATTRIBUTE] === SEARCH_DOCUMENT_VERSION) {
    return item[SEARCH_TEXT_ATTRIBUTE];
  }
  return buildSearchText(item);
}

/** METADATA 항목의 비교용 속성. 저장된 값이 현재 정의면 그대로, 아니면 METADATA로 다시 뽑는다 */
export function searchAttributesOf(item: any): SearchAttributes {
  const stored = item[SEARCH_ATTRIBUTES_ATTRIBUTE];
  if (stored && typeof stored === 'object' && item[SEARCH_DOC_VERSION_ATTRIBUTE] === SEARCH_DOCUMENT_VERSION) {
    return stored as SearchAttributes;
  }
  return extractSearchAttributes(item);
}
