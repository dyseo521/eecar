/**
 * 검색 LLM 후보 모델 실측 (AWS 자격 증명 필요, 소액 과금).
 *
 *   npx tsx eval/ts/llm-candidates.ts --model <inference profile id> --label <이름> [--run 1] [--explain]
 *
 * 프로덕션과 같은 코드 경로를 쓴다.
 * - 쿼리 확장: search-llm.ts의 프롬프트·파싱 (expandSearchQuery) + invokeClaude
 * - 임베딩: [원래 질의, ...확장 질의]를 Titan으로 임베딩한 뒤 averageEmbeddings
 *   (원래 질의는 캐시 사용. Titan v2는 결정적이라 재계산과 같다, DECISION_LOG E-10)
 * - 검색: vector-search와 같이 벡터 상위 20 → 후보 안 BM25(원래 질의) → α=0.7 → 상위 10
 * - 결과 설명(--explain): 정렬한 qid 앞 20개 질의에 대해, 모든 모델에 같은 입력
 *   (확장 없는 prod-hybrid 상위 10)으로 generateExplanations 실행
 * - Converse에 temperature를 넣은 호출 1회 (Slack 에이전트가 temperature를 보냄)
 *
 * 출력 (eval/reports/llm-candidates/)
 *   <label>-run<N>-expansion.jsonl  질의별 지연·토큰·파싱 결과
 *   <label>-run<N>.run.jsonl        Python 러너로 채점할 run 파일
 *   <label>-explain.jsonl           결과 설명 표본 측정
 *   <label>-converse.json           temperature 호환 확인
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { findTopKSimilar, generateEmbedding, invokeClaude } from '../../backend/src/utils/bedrock.js';
import { hybridSearch, preparePartForBM25 } from '../../backend/src/utils/search.js';
import {
  averageEmbeddings,
  expandSearchQuery,
  generateExplanations,
  TextGenerator,
} from '../../backend/src/utils/search-llm.js';

const DATASET = 'eval/datasets/v1';
const OUT_DIR = 'eval/reports/llm-candidates';
const CONCURRENCY = 4;
const PROD_TOP_K = 10;
const ALPHA = 0.7;
const EXPLAIN_SAMPLE = 20;

interface CallMetrics {
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  stopReason?: string;
}

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, 'utf-8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l) as T);
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

// 계정 쿼터: global cross-region 분당 요청 50 (Haiku 4.5, Sonnet 4.6 모두, Service Quotas 조회).
// 쿼터를 넘기면 스로틀링이 파싱 성공률·지연 측정을 오염시키므로 호출 시작 간격을 제한한다.
const RPM = Number(arg('rpm', '40'));
let nextSlot = 0;
async function rateLimit(): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextSlot);
  nextSlot = slot + 60_000 / RPM;
  if (slot > now) await new Promise(resolve => setTimeout(resolve, slot - now));
}

/** invokeClaude를 감싸 호출 지연과 토큰을 기록하는 generator */
function measuredGenerator(modelId: string): { generate: TextGenerator; calls: CallMetrics[] } {
  const calls: CallMetrics[] = [];
  const generate: TextGenerator = async (prompt, maxTokens) => {
    await rateLimit();
    const t0 = performance.now();
    const r = await invokeClaude([{ role: 'user', content: prompt }], { maxTokens, modelId });
    calls.push({ latencyMs: performance.now() - t0, inputTokens: r.inputTokens, outputTokens: r.outputTokens, stopReason: r.stopReason });
    return r.text;
  };
  return { generate, calls };
}

function prodHybrid(
  queryVector: number[],
  queryText: string,
  vectors: Array<{ id: string; vector: number[] }>,
  byId: Map<string, Record<string, unknown>>
): Array<{ partId: string; score: number }> {
  const vectorMatches = findTopKSimilar(queryVector, vectors, PROD_TOP_K * 2);
  const candidates = vectorMatches.map(m => ({ id: m.id, text: preparePartForBM25(byId.get(m.id)) }));
  return hybridSearch(vectorMatches, candidates, queryText, ALPHA)
    .slice(0, PROD_TOP_K)
    .map(m => ({ partId: m.id, score: m.score }));
}

async function main(): Promise<void> {
  const modelId = arg('model');
  const label = arg('label');
  const runIndex = Number(arg('run', '1'));
  const explain = process.argv.includes('--explain');
  mkdirSync(OUT_DIR, { recursive: true });

  const parts = readJsonl<{ part: Record<string, unknown> & { partId: string } }>(join(DATASET, 'corpus.jsonl')).map(r => r.part);
  const queries = readJsonl<{ id: string; text: string }>(join(DATASET, 'queries.jsonl'));
  const cache = JSON.parse(readFileSync(join(DATASET, 'embeddings/titan-embed-text-v2.json'), 'utf-8'));
  const vectors = parts.map(p => ({ id: p.partId, vector: cache.docs[p.partId] as number[] }));
  const byId = new Map(parts.map(p => [p.partId, p]));

  // 1) 쿼리 확장 → 평균 임베딩 → prod-hybrid
  const expansion = await mapPool(queries, CONCURRENCY, async q => {
    const { generate, calls } = measuredGenerator(modelId);
    const result = await expandSearchQuery(q.text, generate);
    const extra = result.queries.slice(1);
    const extraVectors = await Promise.all(extra.map(text => generateEmbedding(text)));
    const vector = averageEmbeddings([cache.queries[q.id], ...extraVectors]);
    return {
      qid: q.id,
      ...(calls[0] ?? { latencyMs: null, inputTokens: 0, outputTokens: 0 }),
      parsed: !result.fallback,
      error: result.error,
      queries: result.queries,
      titanCalls: extra.length,
      results: prodHybrid(vector, q.text, vectors, byId),
    };
  });

  const stem = `${label}-run${runIndex}`;
  writeFileSync(
    join(OUT_DIR, `${stem}-expansion.jsonl`),
    expansion.map(({ results: _r, ...rest }) => JSON.stringify(rest)).join('\n') + '\n',
    'utf-8'
  );
  writeFileSync(
    join(OUT_DIR, `${stem}.run.jsonl`),
    expansion.map(e => JSON.stringify({ qid: e.qid, results: e.results })).join('\n') + '\n',
    'utf-8'
  );
  const parsedCount = expansion.filter(e => e.parsed).length;
  console.log(`${label} run${runIndex}: expansion parsed ${parsedCount}/${queries.length}`);

  if (!explain) return;

  // 2) 결과 설명: 같은 입력(확장 없는 prod-hybrid 상위 10)으로 모델 비교
  const sample = [...queries].sort((a, b) => a.id.localeCompare(b.id)).slice(0, EXPLAIN_SAMPLE);
  const explanations = await mapPool(sample, CONCURRENCY, async q => {
    const top = prodHybrid(cache.queries[q.id], q.text, vectors, byId);
    const items = top.map(t => {
      const p = byId.get(t.partId) as Record<string, string>;
      return { id: t.partId, name: p.name, manufacturer: p.manufacturer, category: p.category };
    });
    const { generate, calls } = measuredGenerator(modelId);
    const result = await generateExplanations(q.text, items, generate);
    return { qid: q.id, ...(calls[0] ?? { latencyMs: null, inputTokens: 0, outputTokens: 0 }), ok: result.ok, fallback: result.fallback, count: items.length };
  });
  writeFileSync(join(OUT_DIR, `${label}-explain.jsonl`), explanations.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf-8');
  console.log(`${label}: explanations ok ${explanations.filter(e => e.ok).length}/${sample.length}`);

  // 3) Converse + temperature 호환 확인 (Slack 에이전트 경로)
  const client = new BedrockRuntimeClient({ region: 'ap-northeast-2' });
  let converse: Record<string, unknown>;
  try {
    const r = await client.send(new ConverseCommand({
      modelId,
      messages: [{ role: 'user', content: [{ text: 'OK라고만 답해' }] }],
      inferenceConfig: { maxTokens: 32, temperature: 0.5 },
    }));
    converse = { temperature: 0.5, ok: true, stopReason: r.stopReason, usage: r.usage };
  } catch (e) {
    converse = { temperature: 0.5, ok: false, error: `${(e as Error).name}: ${(e as Error).message}` };
  }
  writeFileSync(join(OUT_DIR, `${label}-converse.json`), JSON.stringify({ modelId, ...converse }, null, 2) + '\n', 'utf-8');
  console.log(`${label}: converse temperature ok=${converse.ok}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
