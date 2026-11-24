/**
 * 자동이 장기 기억의 순수 로직 (DECISION_LOG A-53). 운영(S3 Vectors + DynamoDB)과 평가(메모리 내 색인)가 함께 쓴다.
 *
 * 이전 구현의 문제 (2026-11-24 확인): 저장 0건, 유사도 미반환으로 점수가 늘 0, 함수 필터 미적용, 유사도 하한 없음,
 * 해결책만 저장(증상, 원인 없음), 코드 변경 여부 모름, 모델이 검증 없이 저장 가능.
 *
 * 참고한 설계
 * - Azure SRE Agent: 증상, 원인, 해결 단계, 함정을 기억으로 남기고 같은 리소스의 기억을 먼저 보여 준다.
 * - ReasoningBank(ICLR 2026): 성공뿐 아니라 실패한 판단에서도 피해야 할 함정을 남긴다. 여기서는 사람의 버튼 피드백을 판정으로 쓴다.
 * - Mem0: 저장 전에 비슷한 기억을 찾아 새로 쓸지 갱신할지 정한다. 기억이 적어 LLM 대신 규칙으로 정한다.
 * - LongMemEval(ICLR 2025): 원문 대신 추출한 사실로 색인하고, 관련 기억이 없으면 없다고 답한다.
 * - MINJA(NeurIPS 2025): 질문만으로 기억을 심을 수 있으므로 모델이 직접 저장하지 못하게 한다.
 */
import type { Diagnosis } from './diagnosis.js';

/**
 * 이 값보다 덜 비슷한 기억은 돌려주지 않는다. 시나리오 v3 dev에서 같은 장애 쌍과 다른 장애 쌍의 유사도 분포로 정했다 (A-53, 측정 + 판단)
 */
export const MEMORY_MIN_SIMILARITY = 0.45;
/** 같은 함수, 같은 장애 유형, 같은 판정, 같은 코드 버전에서 이 값 이상이면 새로 쓰지 않고 갱신한다 (A-53, 판단) */
export const MEMORY_DUPLICATE_SIMILARITY = 0.8;
export const MEMORY_RECALL_LIMIT = 3;

export type MemoryOutcome = 'confirmed' | 'refuted';

export interface MemoryRecord {
  key: string;
  /** confirmed: 사람이 원인이 맞다고 확인 / refuted: 사람이 원인이 틀렸다고 확인 (피해야 할 판단) */
  outcome: MemoryOutcome;
  verdict: string;
  question: string;
  summary: string;
  cause?: string;
  component?: string;
  functionName?: string;
  faultType?: string;
  evidence: string[];
  fixAction?: string;
  /** 기억을 만들 때 함수 코드와 레이어의 지문. 지금과 다르면 원인이 달라졌을 수 있다 */
  codeVersion?: string;
  createdAt: string;
  lastSeenAt: string;
  count: number;
  confirmedBy?: string;
}

export interface MemoryHit {
  key: string;
  similarity: number;
}

export interface MemoryView {
  outcome: MemoryOutcome;
  similarity: number;
  sameFunction: boolean;
  /** true: 기억 이후 코드가 바뀜 / false: 같음 / null: 알 수 없음 */
  codeChanged: boolean | null;
  count: number;
  functionName?: string;
  faultType?: string;
  summary: string;
  cause?: string;
  evidence: string[];
  fixAction?: string;
  createdAt: string;
  lastSeenAt: string;
}

export interface RecallResult {
  memories: MemoryView[];
  note: string;
}

const TEXT_LIMIT = 600;
const EVIDENCE_LIMIT = 3;

const clip = (s: string | undefined, n = TEXT_LIMIT) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export function functionOf(component?: string): string | undefined {
  return component?.startsWith('lambda:') ? component.slice('lambda:'.length) : undefined;
}

const sameName = (a?: string, b?: string) =>
  Boolean(a && b) && a!.toLowerCase().replace(/function$/, '') === b!.toLowerCase().replace(/function$/, '');

/** 색인 문장: 원문 대화 대신 함수, 장애 유형, 질문, 결론, 원인만 쓴다 (LongMemEval의 사실 기반 키) */
export function memoryIndexText(r: Pick<MemoryRecord, 'functionName' | 'component' | 'faultType' | 'question' | 'summary' | 'cause'>): string {
  return [
    `함수: ${r.functionName ?? r.component ?? '알 수 없음'}`,
    r.faultType ? `장애 유형: ${r.faultType}` : '',
    `질문: ${clip(r.question, 300)}`,
    `결론: ${clip(r.summary, 300)}`,
    r.cause ? `원인: ${clip(r.cause, 400)}` : '',
  ].filter(Boolean).join('\n');
}

/** 검색 문장. 색인 문장과 같은 형식으로 맞춘다 */
export function memoryQueryText(query: string, functionName?: string): string {
  return [functionName ? `함수: ${functionName}` : '', `질문: ${clip(query, 500)}`].filter(Boolean).join('\n');
}

/** 진단과 사람의 판정으로 기억 한 건을 만든다. 원인을 말하지 않은 진단(no_fault, insufficient_evidence)은 기억하지 않는다 */
export function recordFromDiagnosis(
  question: string,
  d: Diagnosis,
  meta: { key: string; outcome: MemoryOutcome; codeVersion?: string; now: string; confirmedBy?: string },
): MemoryRecord | null {
  if ((d.verdict !== 'root_cause' && d.verdict !== 'hypothesis') || !d.summary) return null;
  const functionName = functionOf(d.component);
  return {
    key: meta.key,
    outcome: meta.outcome,
    verdict: d.verdict,
    question: clip(question, 500),
    summary: clip(d.summary),
    ...(d.cause ? { cause: clip(d.cause) } : {}),
    ...(d.component ? { component: d.component } : {}),
    ...(functionName ? { functionName } : {}),
    ...(d.fault_type ? { faultType: d.fault_type } : {}),
    evidence: (d.evidence ?? []).slice(0, EVIDENCE_LIMIT).map(e => clip(e, 300)),
    ...(d.fix?.action ? { fixAction: clip(d.fix.action) } : {}),
    ...(meta.codeVersion ? { codeVersion: meta.codeVersion } : {}),
    createdAt: meta.now,
    lastSeenAt: meta.now,
    count: 1,
    ...(meta.confirmedBy ? { confirmedBy: meta.confirmedBy } : {}),
  };
}

/** 같은 사례로 볼 조건 (갱신 후보). 유사도 조건은 저장 단계에서 함께 본다 */
export function sameCase(a: MemoryRecord, b: MemoryRecord): boolean {
  return (a.functionName ?? a.component) === (b.functionName ?? b.component)
    && (a.faultType ?? '') === (b.faultType ?? '')
    && a.outcome === b.outcome
    && (a.codeVersion ?? '') === (b.codeVersion ?? '');
}

/** 기존 기억을 새 확인으로 갱신한다: 횟수를 올리고 최신 서술로 바꾼다 (Mem0의 UPDATE) */
export function mergeRecord(existing: MemoryRecord, incoming: MemoryRecord): MemoryRecord {
  return { ...incoming, key: existing.key, createdAt: existing.createdAt, count: existing.count + 1 };
}

/**
 * 검색 결과를 걸러 정렬한다.
 * - 유사도 하한 아래는 버린다(관련 기억이 없으면 없다고 답한다).
 * - 같은 함수의 기억을 먼저 둔다(Azure SRE Agent).
 * - 코드 지문이 지금과 다르면 표시한다(오래된 기억).
 */
export function rankMemories(
  hits: MemoryHit[],
  records: Map<string, MemoryRecord>,
  opts: { functionName?: string; currentVersions?: Map<string, string | undefined>; minSimilarity?: number; limit?: number } = {},
): MemoryView[] {
  const min = opts.minSimilarity ?? MEMORY_MIN_SIMILARITY;
  const views: MemoryView[] = [];
  for (const h of hits) {
    const r = records.get(h.key);
    if (!r || h.similarity < min) continue;
    const current = r.functionName ? opts.currentVersions?.get(r.functionName) : undefined;
    views.push({
      outcome: r.outcome,
      similarity: Math.round(h.similarity * 100) / 100,
      sameFunction: sameName(opts.functionName, r.functionName),
      codeChanged: r.codeVersion && current ? r.codeVersion !== current : null,
      count: r.count,
      ...(r.functionName ? { functionName: r.functionName } : {}),
      ...(r.faultType ? { faultType: r.faultType } : {}),
      summary: r.summary,
      ...(r.cause ? { cause: r.cause } : {}),
      evidence: r.evidence,
      ...(r.fixAction ? { fixAction: r.fixAction } : {}),
      createdAt: r.createdAt,
      lastSeenAt: r.lastSeenAt,
    });
  }
  views.sort((a, b) => Number(b.sameFunction) - Number(a.sameFunction) || b.similarity - a.similarity || b.lastSeenAt.localeCompare(a.lastSeenAt));
  return views.slice(0, opts.limit ?? MEMORY_RECALL_LIMIT);
}

export function formatRecall(memories: MemoryView[]): RecallResult {
  if (memories.length === 0) {
    return { memories, note: `관련 기억 없음. 유사도 ${MEMORY_MIN_SIMILARITY} 이상인 과거 사례가 없으니 기억 없이 조사한다.` };
  }
  return {
    memories,
    note: '과거 기억은 확인할 가설이다. 기억만으로 root_cause를 쓰지 말고 도구로 지금 증상과 맞는지 확인한다. '
      + 'outcome=refuted는 사람이 틀렸다고 확인한 판단이므로 같은 결론을 내리기 전에 근거를 다시 본다. '
      + 'codeChanged=true는 기억 이후 코드가 바뀌어 원인이 달라졌을 수 있다.',
  };
}

/** analyze_error 프롬프트와 Slack 표시용 한 줄 */
export function memoryLine(m: MemoryView): string {
  const tag = m.outcome === 'refuted' ? '틀린 것으로 확인된 판단' : `확인된 원인, ${m.count}회`;
  const changed = m.codeChanged ? ', 이후 코드 변경됨' : '';
  return `${m.functionName ?? '함수 미상'} ${m.faultType ?? ''} (${tag}${changed}, 유사도 ${m.similarity}): ${m.cause ?? m.summary}`.replace(/\s+/g, ' ');
}

/** 메모리 내 색인용 코사인 유사도 (평가와 테스트). 정규화된 임베딩이면 내적과 같다 */
export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
