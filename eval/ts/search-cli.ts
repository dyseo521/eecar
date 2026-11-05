/**
 * 평가용 검색 실행기. 프로덕션 검색 코드(backend/src/utils)를 그대로 호출해
 * "평가가 실제 코드를 측정한다"는 전제를 지킨다.
 *
 *   npx tsx eval/ts/search-cli.ts --mode bm25 --dataset eval/datasets/v1 --out run.jsonl [--top 100]
 *
 * mode
 *   bm25           전체 코퍼스에 프로덕션 BM25 색인(Bm25Index) 적용. 문서 텍스트는 buildSearchText
 *   vector         캐시된 Titan 임베딩으로 전체 코퍼스 코사인 검색 (findTopKSimilar). 문서 임베딩은 buildEmbeddingText
 *   prod-hybrid    vector-search Lambda 4~7단계 재현 (2026-11 이후 구조, DECISION_LOG E-23):
 *                  벡터 상위 100 + BM25 상위 100 → fuseRankedLists(α=0.5) → 상위 topK
 *   legacy-hybrid  이전 프로덕션 구조 (벡터 상위 topK*2 → 후보 안에서만 BM25 → α=0.7 → 상위 topK).
 *                  문서 텍스트도 이전 정의(preparePartForBM25, preparePartText 임베딩)
 *   (쿼리 확장, 캐시, 필터, 설명 생성은 제외)
 *
 * vector, prod-hybrid, legacy-hybrid는 build-embeddings.ts로 만든 임베딩 캐시가 필요하다.
 *   질의·이전 문서 임베딩: build-embeddings --dataset <dir>
 *   현재 문서 임베딩:      build-embeddings --dataset <dir> --doc-text v2-notrade
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  Bm25Index,
  CANDIDATES_PER_RETRIEVER,
  fuseRankedLists,
  HYBRID_ALPHA,
  hybridSearch,
  preparePartForBM25,
} from '../../backend/src/utils/search.js';
import { buildSearchText } from '../../backend/src/utils/search-document.js';

type Mode = 'bm25' | 'vector' | 'prod-hybrid' | 'legacy-hybrid';
const MODES: Mode[] = ['bm25', 'vector', 'prod-hybrid', 'legacy-hybrid'];

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
/** 현재 프로덕션 문서 임베딩 (buildEmbeddingText) */
export const DOC_EMBEDDING_CACHE_FILE = 'embeddings/titan-embed-text-v2.doc-v2-notrade.json';

function parseArgs(argv: string[]): Args {
  const get = (name: string, fallback?: string): string => {
    const index = argv.indexOf(`--${name}`);
    if (index >= 0 && argv[index + 1]) return argv[index + 1];
    if (fallback !== undefined) return fallback;
    throw new Error(`missing --${name}`);
  };
  const mode = get('mode') as Mode;
  if (!MODES.includes(mode)) {
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

function readCache(path: string, hint: string): any {
  if (!existsSync(path)) {
    throw new Error(`embedding cache not found: ${path}\nrun \`npx tsx eval/ts/build-embeddings.ts ${hint}\` with AWS credentials first`);
  }
  return JSON.parse(readFileSync(path, 'utf-8'));
}

/** legacy=true면 이전 문서 임베딩(preparePartText), 아니면 현재 문서 임베딩(buildEmbeddingText) */
function loadEmbeddings(dataset: string, legacy = false): EmbeddingCache {
  const base = readCache(join(dataset, EMBEDDING_CACHE_FILE), `--dataset ${dataset}`) as EmbeddingCache;
  if (legacy) return base;
  const docs = readCache(join(dataset, DOC_EMBEDDING_CACHE_FILE), `--dataset ${dataset} --doc-text v2-notrade`).docs;
  return { ...base, docs };
}

function bm25IndexOf(parts: Part[]): Bm25Index {
  return Bm25Index.fromTexts(parts.map(p => ({ id: p.partId, text: buildSearchText(p) })));
}

function runBm25(parts: Part[], queries: Query[], top: number): Map<string, Ranked[]> {
  const index = bm25IndexOf(parts);
  const runs = new Map<string, Ranked[]>();
  for (const q of queries) {
    runs.set(q.id, index.search(q.text, top).map(h => ({ partId: h.id, score: h.score })));
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
  topK: number
): Promise<Map<string, Ranked[]>> {
  const { findTopKSimilar } = await import('../../backend/src/utils/bedrock.js');
  const vectors = parts.map(p => ({ id: p.partId, vector: cache.docs[p.partId] }));
  const index = bm25IndexOf(parts);
  const runs = new Map<string, Ranked[]>();
  for (const q of queries) {
    // vector-search/index.ts Step 4~7 (필터 없음)
    const vectorMatches = findTopKSimilar(cache.queries[q.id], vectors, CANDIDATES_PER_RETRIEVER);
    const bm25Matches = index.search(q.text, CANDIDATES_PER_RETRIEVER);
    const fused = fuseRankedLists(vectorMatches, bm25Matches, HYBRID_ALPHA).slice(0, topK);
    runs.set(q.id, fused.map(m => ({ partId: m.id, score: m.score })));
  }
  return runs;
}

async function runLegacyHybrid(
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
  } else if (args.mode === 'prod-hybrid') {
    runs = await runProdHybrid(parts, queries, loadEmbeddings(args.dataset), args.prodTopK);
  } else {
    runs = await runLegacyHybrid(parts, queries, loadEmbeddings(args.dataset, true), args.prodTopK, args.alpha);
  }

  const lines = queries.map(q => JSON.stringify({ qid: q.id, results: runs.get(q.id) ?? [] }));
  writeFileSync(args.out, lines.join('\n') + '\n', 'utf-8');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
