/**
 * 합성 검사 판정 (eval/prod/search-canary.mjs와 같은 규칙).
 * 요청 하나가 실패해도 나머지 검사는 계속한다. 실패 목록이 비어 있으면 통과다.
 */
import type { CanarySpec } from './spec.js';

export interface PostResult {
  status: number;
  ms: number;
  body: any;
}

export type Post = (path: string, payload: unknown) => Promise<PostResult>;

export interface CanaryResult {
  lines: string[];
  failures: string[];
}

export async function runCanary(spec: CanarySpec, post: Post): Promise<CanaryResult> {
  const lines: string[] = [];
  const failures: string[] = [];
  const fail = (id: string, message: string) => failures.push(`${id}: ${message}`);

  const call = async (id: string, path: string, payload: unknown): Promise<PostResult | null> => {
    try {
      return await post(path, payload);
    } catch (error) {
      fail(id, `요청 실패 (${(error as Error).name}: ${(error as Error).message})`);
      return null;
    }
  };

  for (const check of spec.checks) {
    const res = await call(check.id, '/api/search', { query: check.query, topK: Math.max(check.top, 5), explain: false, canary: true });
    if (!res) continue;
    const { status, ms, body } = res;
    const results: any[] = body?.results ?? body?.data?.results ?? [];
    const d = body?.diagnostics ?? {};
    lines.push(`${check.id} "${check.query}": ${status} ${ms}ms, 결과 ${results.length}, 벡터 ${d.vectorCandidates}, BM25 ${d.bm25Candidates}, 색인 ${d.indexSize}`);
    if (status !== 200) { fail(check.id, `HTTP ${status}`); continue; }
    if (ms > spec.maxLatencyMs) fail(check.id, `지연 ${ms}ms > ${spec.maxLatencyMs}ms`);
    if (!(d.vectorCandidates >= spec.diagnostics.minVectorCandidates)) fail(check.id, `벡터 후보 ${d.vectorCandidates} < ${spec.diagnostics.minVectorCandidates} (벡터 검색이 꺼졌거나 색인이 비었을 수 있음)`);
    if (!(d.bm25Candidates >= spec.diagnostics.minBm25Candidates)) fail(check.id, `BM25 후보 ${d.bm25Candidates}`);
    if (!(d.indexSize >= spec.diagnostics.minIndexSize)) fail(check.id, `BM25 색인 크기 ${d.indexSize} < ${spec.diagnostics.minIndexSize}`);
    const top = results.slice(0, check.top);
    if (top.length < check.top) fail(check.id, `결과 ${top.length}개 < ${check.top}개`);
    for (const [i, r] of top.entries()) {
      if (check.category && r.part?.category !== check.category) fail(check.id, `${i + 1}위 카테고리 ${r.part?.category} (기대 ${check.category}): ${r.part?.name}`);
      for (const label of check.noMismatch ?? []) {
        const bad = (r.conditions?.mismatched ?? []).find((m: string) => m.startsWith(label));
        if (bad) fail(check.id, `${i + 1}위가 조건 위반(${bad}): ${r.part?.name}`);
      }
    }
  }

  // 설명 경로: 첫 질의의 상위 결과로 LLM 설명을 받는다 (C-09: 폴백이 200 응답 뒤에 숨었다)
  const search = await call('explain', '/api/search', { query: spec.explain.query, topK: spec.explain.parts, explain: false, canary: true });
  if (search) {
    const ids = (search.body?.results ?? []).slice(0, spec.explain.parts).map((r: any) => r.partId);
    const res = await call('explain', '/api/search/explain', { query: spec.explain.query, partIds: ids, canary: true });
    if (res) {
      lines.push(`explain "${spec.explain.query}" (${ids.length}개): ${res.status} ${res.ms}ms, fallback ${res.body?.fallback}`);
      if (res.status !== 200) fail('explain', `HTTP ${res.status}`);
      else if (res.body?.fallback !== false) fail('explain', 'LLM 설명이 폴백됨 (모델 접근, 쿼터, 스로틀링, 하루 상한 확인)');
    }
  }
  return { lines, failures };
}
