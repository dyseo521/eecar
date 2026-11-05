/**
 * 평가용 검색 실행기. 프로덕션 검색 코드(backend/src/utils)를 그대로 호출해
 * "평가가 실제 코드를 측정한다"는 전제를 지킨다.
 *
 *   npx tsx eval/ts/search-cli.ts --mode bm25 --dataset eval/datasets/v1 --out run.jsonl [--top 100]
 *
 * mode
 *   bm25         전체 코퍼스에 프로덕션 BM25 적용 (토크나이저·점수식·문서 텍스트 동일)
 *   vector       캐시된 Titan 임베딩으로 전체 코퍼스 코사인 검색 (findTopKSimilar)
 *   prod-hybrid  vector-search Lambda 4~8단계 재현:
 *                벡터 상위 topK*2 후보 → 후보 안에서만 BM25 → α=0.7 결합 → 상위 topK
 *                (쿼리 확장, 캐시, 필터, 설명 생성은 제외)
 *
 * vector, prod-hybrid는 build-embeddings.ts로 만든 임베딩 캐시가 필요하다.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { calculateBM25Scores, hybridSearch, preparePartForBM25 } from '../../backend/src/utils/search.js';

type Mode = 'bm25' | 'vector' | 'prod-hybrid';

interface Args {
  mode: Mode;
  dataset: string;
  out: string;
  top: number;
  prodTopK: number;
  alpha: number;
}

interface Part {
  partId: string;
  [key: string]: unknown;
}

interface Query {
  id: string;
  text: string;
}

interface Ranked {
  partId: string;
  score: number;
}

interface EmbeddingCache {
  model: string;
  docs: Record<string, number[]>;
  queries: Record<string, number[]>;
}

export const EMBEDDING_CACHE_FILE = 'embeddings/titan-embed-text-v2.json';

function parseArgs(argv: string[]): Args {
  const get = (name: string, fallback?: string): string => {
    const index = argv.indexOf(`--${name}`);
    if (index >= 0 && argv[index + 1]) return argv[index + 1];
    if (fallback !== undefined) return fallback;
    throw new Error(`missing --${name}`);
  };
  const mode = get('mode') as Mode;
  if (!['bm25', 'vector', 'prod-hybrid'].includes(mode)) {
    throw new Error(`unknown mode: ${mode}`);
  }
  return {
    mode,
    dataset: get('dataset'),
    out: get('out'),
    top: Number(get('top', '100')),
    prodTopK: Number(get('prod-topk', '10')),
    alpha: Number(get('alpha', '0.7')),
  };
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, 'utf-8')
    .split('\n')
    .filter(line => line.trim().length > 0)
    .map(line => JSON.parse(line) as T);
}

function loadEmbeddings(dataset: string): EmbeddingCache {
  const path = join(dataset, EMBEDDING_CACHE_FILE);
  if (!existsSync(path)) {
    throw new Error(
      `embedding cache not found: ${path}\n` +
        'run `npx tsx eval/ts/build-embeddings.ts --dataset <dir>` with AWS credentials first'
    );
  }
  return JSON.parse(readFileSync(path, 'utf-8')) as EmbeddingCache;
}

function runBm25(parts: Part[], queries: Query[], top: number): Map<string, Ranked[]> {
  const documents = parts.map(p => ({ id: p.partId, text: preparePartForBM25(p) }));
  const runs = new Map<string, Ranked[]>();
  for (const q of queries) {
    const ranked = calculateBM25Scores(q.text, documents)
      .filter(s => s.bm25Score > 0) // 점수 0은 검색되지 않은 문서로 본다
      .sort((a, b) => b.bm25Score - a.bm25Score)
      .slice(0, top)
      .map(s => ({ partId: s.id, score: s.bm25Score }));
    runs.set(q.id, ranked);
  }
  return runs;
}

async function runVector(
  parts: Part[],
  queries: Query[],
  cache: EmbeddingCache,
  top: number
): Promise<Map<string, Ranked[]>> {
  const { findTopKSimilar } = await import('../../backend/src/utils/bedrock.js');
  const vectors = parts.map(p => ({ id: p.partId, vector: cache.docs[p.partId] }));
  const runs = new Map<string, Ranked[]>();
  for (const q of queries) {
    runs.set(
      q.id,
      findTopKSimilar(cache.queries[q.id], vectors, top).map(m => ({ partId: m.id, score: m.score }))
    );
  }
  return runs;
}

async function runProdHybrid(
  parts: Part[],
  queries: Query[],
  cache: EmbeddingCache,
  topK: number,
  alpha: number
): Promise<Map<string, Ranked[]>> {
  const { findTopKSimilar } = await import('../../backend/src/utils/bedrock.js');
  const vectors = parts.map(p => ({ id: p.partId, vector: cache.docs[p.partId] }));
  const byId = new Map(parts.map(p => [p.partId, p]));
  const runs = new Map<string, Ranked[]>();
  for (const q of queries) {
    // vector-search/index.ts: candidateCount = topK * 2, BM25는 후보 안에서만 계산
    const vectorMatches = findTopKSimilar(cache.queries[q.id], vectors, topK * 2);
    const candidates = vectorMatches.map(m => ({ id: m.id, text: preparePartForBM25(byId.get(m.id)) }));
    const fused = hybridSearch(vectorMatches, candidates, q.text, alpha).slice(0, topK);
    runs.set(q.id, fused.map(m => ({ partId: m.id, score: m.score })));
  }
  return runs;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const parts = readJsonl<{ part: Part }>(join(args.dataset, 'corpus.jsonl')).map(r => r.part);
  const queries = readJsonl<Query>(join(args.dataset, 'queries.jsonl'));

  let runs: Map<string, Ranked[]>;
  if (args.mode === 'bm25') {
    runs = runBm25(parts, queries, args.top);
  } else if (args.mode === 'vector') {
    runs = await runVector(parts, queries, loadEmbeddings(args.dataset), args.top);
  } else {
    runs = await runProdHybrid(parts, queries, loadEmbeddings(args.dataset), args.prodTopK, args.alpha);
  }

  const lines = queries.map(q => JSON.stringify({ qid: q.id, results: runs.get(q.id) ?? [] }));
  writeFileSync(args.out, lines.join('\n') + '\n', 'utf-8');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
