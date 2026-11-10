/**
 * 검색에서 쓰는 LLM 작업(쿼리 확장, 결과 설명)의 프롬프트와 파싱.
 *
 * 모델 호출은 generate 함수로 주입받는다. 그래서 Lambda(callClaude)와 평가 하네스
 * (모델별 실측)가 같은 프롬프트·파싱 코드를 쓴다. 프롬프트 문자열과 파싱 규칙은
 * vector-search에 있던 구현을 그대로 옮긴 것이다.
 */

export type TextGenerator = (prompt: string, maxTokens: number) => Promise<string>;

export const EXPANSION_MAX_TOKENS = 150;
export const EXPLANATION_MAX_TOKENS = 1800;
export const MAX_EXPANSIONS = 3;
export const FALLBACK_REASON = '유사도 기반 매칭';

// ---------------------------------------------------------------- 쿼리 확장

export function buildExpansionPrompt(query: string): string {
  return `전기차 부품 검색 쿼리를 확장해주세요. 유사한 의미의 검색어 3개를 JSON 배열로만 응답해주세요.
입력: "${query}"
예시 입력: "배터리"
예시 출력: ["배터리 팩", "리튬이온 셀", "에너지 저장 모듈"]

JSON 배열만 출력하세요:`;
}

/**
 * 모델 응답을 [원래 질의, 확장 질의...]로 파싱한다. 쓸 수 없는 응답이면 null.
 * @throws JSON이 아닌 응답 (호출자가 폴백 처리)
 */
export function parseExpansion(query: string, response: string): string[] | null {
  const cleaned = response.trim().replace(/```json\n?|\n?```/g, '');
  const parsed = JSON.parse(cleaned);
  if (Array.isArray(parsed) && parsed.length > 0) {
    return [...new Set([query, ...(parsed.slice(0, MAX_EXPANSIONS) as string[])])];
  }
  return null;
}

export interface ExpansionResult {
  queries: string[];
  fallback: boolean;
  error?: string;
}

/** 실패하면 원래 질의만으로 검색을 계속한다 (fallback = true). */
export async function expandSearchQuery(query: string, generate: TextGenerator): Promise<ExpansionResult> {
  try {
    const response = await generate(buildExpansionPrompt(query), EXPANSION_MAX_TOKENS);
    const queries = parseExpansion(query, response);
    if (queries) {
      return { queries, fallback: false };
    }
    console.error('Query expansion failed: empty or non-array response');
    return { queries: [query], fallback: true, error: 'empty or non-array response' };
  } catch (error) {
    console.error('Query expansion failed:', error);
    return { queries: [query], fallback: true, error: error instanceof Error ? error.message : String(error) };
  }
}

/** 확장 질의 임베딩들의 평균을 L2 정규화한다. 하나뿐이면 그대로 반환한다. */
export function averageEmbeddings(embeddings: number[][]): number[] {
  if (embeddings.length === 1) {
    return embeddings[0];
  }
  const length = embeddings[0].length;
  const averaged: number[] = new Array(length).fill(0);
  for (const embedding of embeddings) {
    for (let i = 0; i < length; i++) {
      averaged[i] += embedding[i];
    }
  }
  for (let i = 0; i < length; i++) {
    averaged[i] /= embeddings.length;
  }
  const norm = Math.sqrt(averaged.reduce((sum, x) => sum + x * x, 0));
  return averaged.map(x => x / norm);
}

// ---------------------------------------------------------------- 결과 설명

export interface ExplanationItem {
  id: string;
  name: string;
  manufacturer: string;
  category: string;
  /** 질의 조건 중 이 부품이 만족한 것 / 만족하지 못한 것 (규칙으로 확인한 사실) */
  matched?: string[];
  mismatched?: string[];
}

/**
 * 결과 설명 프롬프트. 이전 프롬프트는 "왜 적합한지"를 "~이므로 적합" 형식으로 쓰게 해서, 조건에 맞지 않는
 * 부품에도 적합한 이유를 지어냈다(운영 확인: 언더커버에 "Model 3 모터 성능 향상에 필요"). 이제 규칙으로 확인한
 * 일치·불일치를 근거로 주고, 맞지 않으면 그렇게 쓰게 한다 (DECISION_LOG A-28).
 */
export function buildExplanationPrompt(query: string, items: ExplanationItem[]): string {
  const facts = (item: ExplanationItem) => {
    const parts = [];
    if (item.matched?.length) parts.push(`일치: ${item.matched.join(', ')}`);
    if (item.mismatched?.length) parts.push(`불일치: ${item.mismatched.join(', ')}`);
    return parts.length ? ` | ${parts.join(' | ')}` : '';
  };
  const partsInfo = items
    .map((item, index) => `${index + 1}. [${item.id}] ${item.name} (${item.manufacturer}, ${item.category})${facts(item)}`)
    .join('\n');
  return `"${query}" 검색 결과의 각 부품이 검색 조건에 맞는지 20-40자로 설명.
- 부품 목록의 "불일치"가 있으면 그 내용을 먼저 쓴다 (예: "용량 17.6kWh로 조건 미달").
- 검색어와 다른 종류의 부품이면 적합하다고 쓰지 않는다.
- 부품 정보에 없는 호환성·성능은 지어내지 않는다. 근거가 없으면 "조건 확인 필요"라고 쓴다.

반드시 JSON 배열 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요.
형식: ["이유1","이유2",...]

부품 목록:
${partsInfo}

JSON 배열:`;
}

export interface ExplanationResult {
  explanations: string[];
  /** 정확히 count개의 설명을 파싱했는지 */
  ok: boolean;
  /** 호출 실패나 배열 없음으로 전부 기본 문구가 됐는지 */
  fallback: boolean;
}

/**
 * 응답에서 JSON 배열을 찾아 설명 목록을 만든다. 모자라면 기본 문구로 채운다.
 * @throws 배열 부분이 JSON이 아닌 경우 (호출자가 폴백 처리)
 */
export function parseExplanations(response: string, count: number): ExplanationResult {
  const jsonStr = response.trim().replace(/^```json\s*|\s*```$/g, '');
  const match = jsonStr.match(/\[[\s\S]*?\]/);
  if (!match) {
    console.error('No JSON array found in response:', response.substring(0, 200));
    return { explanations: new Array(count).fill(FALLBACK_REASON), ok: false, fallback: true };
  }
  const explanations = JSON.parse(match[0]) as string[];
  const ok = Array.isArray(explanations) && explanations.length === count;
  if (!ok) {
    console.warn(`Expected ${count} explanations, got ${explanations.length}`);
    while (explanations.length < count) {
      explanations.push(FALLBACK_REASON);
    }
  }
  return { explanations, ok, fallback: false };
}

export async function generateExplanations(
  query: string,
  items: ExplanationItem[],
  generate: TextGenerator
): Promise<ExplanationResult> {
  let response = '';
  try {
    response = await generate(buildExplanationPrompt(query, items), EXPLANATION_MAX_TOKENS);
    return parseExplanations(response, items.length);
  } catch (error) {
    // 폴백 한 번이 에러 로그 한 건이 되게 한다. 에러 로그 한 건마다 Slack 알림이 나간다 (A-49).
    // 호출이 실패하면 응답이 없으므로, 응답 원문은 파싱에 실패했을 때만 같은 로그에 붙인다.
    const raw = response ? ['Raw response:', response.substring(0, 200)] : [];
    console.error('Batch explanation generation failed:', error, ...raw);
    return { explanations: new Array(items.length).fill(FALLBACK_REASON), ok: false, fallback: true };
  }
}
