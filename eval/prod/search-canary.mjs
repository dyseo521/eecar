/**
 * 운영 검색 합성 검사 (DECISION_LOG A-39). 의존성 없이 Node 20+에서 실행한다.
 *
 *   node eval/prod/search-canary.mjs [--api https://.../prod]
 *
 * - 검색: canary=true로 캐시를 거치지 않고 실제 파이프라인을 실행한다. 결과 카테고리·조건 위반과
 *   검색기별 후보 수(벡터·BM25), 색인 크기를 확인한다.
 * - 설명: LLM 설명이 폴백 없이 생성되는지 확인한다 (C-09: 폴백이 200 응답 뒤에 숨었다).
 * - 실패하면 종료 코드 1. GitHub Actions가 Slack으로 알린다 (.github/workflows/search-canary.yml).
 */
import { readFileSync, appendFileSync } from 'fs';

const argApi = process.argv.indexOf('--api');
const API = (argApi >= 0 ? process.argv[argApi + 1] : process.env.EECAR_API_URL) ||
  'https://6o4futufni.execute-api.ap-northeast-2.amazonaws.com/prod';
const spec = JSON.parse(readFileSync(new URL('./canary.json', import.meta.url), 'utf-8'));

async function post(path, payload) {
  const started = performance.now();
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });
  const ms = Math.round(performance.now() - started);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 200) }; }
  return { status: res.status, ms, body };
}

const failures = [];
const lines = [];
const fail = (id, message) => failures.push(`${id}: ${message}`);

for (const check of spec.checks) {
  const { status, ms, body } = await post('/api/search', { query: check.query, topK: Math.max(check.top, 5), explain: false, canary: true });
  const results = body.results ?? body.data?.results ?? [];
  const d = body.diagnostics ?? {};
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
      const bad = (r.conditions?.mismatched ?? []).find(m => m.startsWith(label));
      if (bad) fail(check.id, `${i + 1}위가 조건 위반(${bad}): ${r.part?.name}`);
    }
  }
}

// 설명 경로: 첫 검사 질의의 상위 결과로 LLM 설명을 받는다
{
  const search = await post('/api/search', { query: spec.explain.query, topK: spec.explain.parts, explain: false, canary: true });
  const ids = (search.body.results ?? []).slice(0, spec.explain.parts).map(r => r.partId);
  const { status, ms, body } = await post('/api/search/explain', { query: spec.explain.query, partIds: ids, canary: true });
  lines.push(`explain "${spec.explain.query}" (${ids.length}개): ${status} ${ms}ms, fallback ${body.fallback}`);
  if (status !== 200) fail('explain', `HTTP ${status}`);
  else if (body.fallback !== false) fail('explain', `LLM 설명이 폴백됨 (모델 접근·쿼터·스로틀링 확인)`);
}

const summary = [`# 검색 합성 검사 (${new Date().toISOString()})`, '', ...lines.map(l => `- ${l}`), '',
  failures.length ? `## 실패 ${failures.length}건` : '## 모두 통과', ...failures.map(f => `- ${f}`)].join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `failures=${failures.slice(0, 5).join(' / ').replace(/\n/g, ' ')}\n`);
process.exit(failures.length ? 1 : 0);
