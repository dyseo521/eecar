/**
 * 검색 기법 실험 실행기 (오프라인, 비용 없음). 여러 구성을 한 번에 실행해 구성별 run 파일을 만든다.
 *
 *   npx tsx eval/ts/experiment-cli.ts --dataset eval/datasets/v1 --configs grid.json --out-dir <dir>
 *
 * 구성 항목
 *   retrieval  prod  : 프로덕션 구조. 벡터 상위 N개 후보 → 후보 안에서만 BM25 → α 가중합 → 상위 10개
 *              full  : 벡터와 BM25를 전체 코퍼스에서 각각 검색한 뒤 결합 → 상위 100개
 *   fusion     weighted : α·정규화(벡터) + (1-α)·정규화(BM25)   (prod는 프로덕션 hybridScore 그대로)
 *              rrf      : Σ 1/(k + rank)                          (Cormack et al., SIGIR 2009)
 *              union : 벡터 상위 N개와 BM25 상위 N개를 각각 그 목록 안에서 min-max 정규화한 뒤 α 결합.
 *                      목록에 없는 쪽 점수는 0. S3 Vectors가 상위 K개만 돌려주는 프로덕션에서 구현할 수 있는 형태
 *   tokenizer  ws | bigram | ws+bigram   (ws = 프로덕션 tokenize)
 *   idf        false면 IDF를 1로 고정 (가설 검증용 변형)
 *   doc        legacy | v2 | v2-noalias  문서 텍스트 정의 (BM25 텍스트와 문서 임베딩 모두)
 *              legacy = preparePartForBM25 + preparePartText 임베딩, v2 = buildSearchText (search-document.ts)
 *   bm25Doc / vecDoc  doc을 BM25 쪽 / 벡터 쪽만 따로 바꿀 때
 *   constraintPenalty / constraintScope  union 결합 뒤 질의 조건 재정렬 (query-understanding.ts).
 *              부품 속성은 정답 attrs가 아니라 프로덕션 extractSearchAttributes로 문서에서 뽑은 값을 쓴다
 *
 * BM25는 프로덕션 Bm25Index, union 결합은 프로덕션 fuseRankedLists를 그대로 쓴다.
 * 실행할 때마다 Bm25Index 점수를 calculateBM25Scores와, prod 구성을 이전 프로덕션 hybridSearch와 대조해 다르면 중단한다.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  bigramTokenize,
  joinedBigramTokenize,
  Bm25Index,
  calculateBM25Scores,
  fuseRankedLists,
  hybridScore,
  hybridSearch,
  normalizeBM25Scores,
  preparePartForBM25,
  tokenize,
} from '../../backend/src/utils/search.js';
import { cosineSimilarity } from '../../backend/src/utils/bedrock.js';
import { buildSearchText } from '../../backend/src/utils/search-document.js';
import { extractSearchAttributes } from '../../backend/src/utils/search-attributes.js';
import { ConstraintScope, parseQuery, rerankByConstraints, scopeConstraints } from '../../backend/src/utils/query-understanding.js';

type Tokenizer = 'ws' | 'bigram' | 'ws+bigram' | 'bigram-joined';
type DocText = 'legacy' | 'v2' | 'v2-noalias' | 'v2-notrade';

interface Config {
  name: string;
  retrieval: 'prod' | 'full' | 'union';
  fusion: 'weighted' | 'rrf' | 'bm25' | 'vector';
  alpha?: number;
  rrfK?: number;
  candidates?: number;
  tokenizer?: Tokenizer;
  idf?: boolean;
  doc?: DocText;
  bm25Doc?: DocText;
  vecDoc?: DocText;
  constraintPenalty?: number;
  constraintScope?: ConstraintScope;
  categoryMode?: 'first' | 'all';
  vehicleConstraint?: boolean;
  vehiclePenalty?: number;
}

interface Ranked {
  partId: string;
  score: number;
}

const PROD_TOP_K = 10;
const FULL_TOP_N = 100;
const HANGUL = /[가-힣]/;

function arg(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing --${name}`);
  return process.argv[index + 1];
}

function readJsonl<T>(path: string): T[] {
  return readFileSync(path, 'utf-8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l) as T);
}

function charBigrams(token: string): string[] {
  if (!HANGUL.test(token) || token.length < 2) return [token];
  const grams: string[] = [];
  for (let i = 0; i < token.length - 1; i++) grams.push(token.slice(i, i + 2));
  return grams;
}

const TOKENIZERS: Record<Tokenizer, (text: string) => string[]> = {
  ws: text => tokenize(text),
  bigram: bigramTokenize, // 프로덕션 SEARCH_TOKENIZER
  'bigram-joined': joinedBigramTokenize,
  'ws+bigram': text =>
    tokenize(text).flatMap(token => {
      const grams = charBigrams(token);
      return grams.length === 1 && grams[0] === token ? [token] : [token, ...grams];
    }),
};

function minMax(values: number[]): number[] {
  const max = Math.max(...values);
  const min = Math.min(...values);
  return max === min ? values.map(() => 0) : values.map(v => (v - min) / (max - min));
}

function ranks(scores: number[], include: (i: number) => boolean): Map<number, number> {
  const order = scores.map((s, i) => [s, i] as const).filter(([, i]) => include(i)).sort((a, b) => b[0] - a[0]);
  return new Map(order.map(([, i], rank) => [i, rank + 1]));
}

function main(): void {
  const dataset = arg('dataset');
  const configs = JSON.parse(readFileSync(arg('configs'), 'utf-8')) as Config[];
  const outDir = arg('out-dir');
  mkdirSync(outDir, { recursive: true });

  const parts = readJsonl<{ part: Record<string, unknown> & { partId: string } }>(join(dataset, 'corpus.jsonl')).map(r => r.part);
  const queries = readJsonl<{ id: string; text: string }>(join(dataset, 'queries.jsonl'));
  const cache = JSON.parse(readFileSync(join(dataset, 'embeddings/titan-embed-text-v2.json'), 'utf-8'));
  const ids = parts.map(p => p.partId);
  const attrsById = new Map(parts.map(p => [p.partId, extractSearchAttributes(p)]));
  const parsedBy = new Map<string, ReturnType<typeof parseQuery>[]>();
  const parsedFor = (config: Config) => {
    const key = `${config.categoryMode ?? 'first'}|${config.vehicleConstraint ?? false}`;
    if (!parsedBy.has(key)) {
      parsedBy.set(key, queries.map(q => parseQuery(q.text, { categoryMode: config.categoryMode, vehicles: config.vehicleConstraint })));
    }
    return parsedBy.get(key)!;
  };

  const TEXT_BUILDERS: Record<DocText, (part: any) => string> = {
    legacy: preparePartForBM25,
    v2: part => buildSearchText(part),
    'v2-noalias': part => buildSearchText(part, { aliases: false }),
    'v2-notrade': part => buildSearchText(part, { trade: false }),
  };
  const textsBy = new Map<DocText, string[]>();
  const textsFor = (doc: DocText): string[] => {
    if (!textsBy.has(doc)) textsBy.set(doc, parts.map(p => TEXT_BUILDERS[doc](p)));
    return textsBy.get(doc)!;
  };
  const texts = textsFor('legacy');

  // 질의 x 문서 코사인 유사도 (프로덕션 cosineSimilarity). 문서 정의별 임베딩 캐시는 build-embeddings --doc-text로 만든다
  const cosineBy = new Map<DocText, number[][]>();
  const cosineFor = (doc: DocText): number[][] => {
    if (!cosineBy.has(doc)) {
      const docs = doc === 'legacy'
        ? cache.docs
        : JSON.parse(readFileSync(join(dataset, `embeddings/titan-embed-text-v2.doc-${doc}.json`), 'utf-8')).docs;
      cosineBy.set(doc, queries.map(q => parts.map(p => cosineSimilarity(cache.queries[q.id], docs[p.partId]))));
    }
    return cosineBy.get(doc)!;
  };

  // 토크나이저·IDF 조합별 전체 코퍼스 BM25 점수
  const fullBm25 = new Map<string, number[][]>();
  const fullBm25For = (tok: Tokenizer, useIdf: boolean, doc: DocText = 'legacy'): number[][] => {
    const key = `${tok}|${useIdf}|${doc}`;
    if (!fullBm25.has(key)) {
      const index = new Bm25Index(ids, textsFor(doc).map(t => TOKENIZERS[tok](t)), useIdf);
      fullBm25.set(key, queries.map(q => index.scores(TOKENIZERS[tok](q.text))));
    }
    return fullBm25.get(key)!;
  };

  // 프로덕션 함수와 대조 (ws, IDF 사용): 다르면 실험 결과를 믿을 수 없으므로 중단
  const reference = fullBm25For('ws', true);
  for (const qi of [0, 30, 60, 90].filter(i => i < queries.length)) {
    const prod = calculateBM25Scores(queries[qi].text, ids.map((id, i) => ({ id, text: texts[i] })));
    prod.forEach((s, i) => {
      if (Math.abs(s.bm25Score - reference[qi][i]) > 1e-9) {
        throw new Error(`BM25 mismatch with production for ${queries[qi].id}/${s.id}`);
      }
    });
  }

  const runConfig = (config: Config): Ranked[][] =>
    queries.map((q, qi) => {
      const tok = config.tokenizer ?? 'ws';
      const useIdf = config.idf ?? true;
      const bm25Doc = config.bm25Doc ?? config.doc ?? 'legacy';
      const vecDoc = config.vecDoc ?? config.doc ?? 'legacy';
      const cosine = cosineFor(vecDoc);
      const docTexts = textsFor(bm25Doc);

      if (config.retrieval === 'prod') {
        const n = config.candidates ?? PROD_TOP_K * 2;
        const alpha = config.alpha ?? 0.7;
        const candidates = cosine[qi]
          .map((score, i) => ({ id: ids[i], score, i }))
          .sort((a, b) => b.score - a.score)
          .slice(0, n);
        const index = new Bm25Index(candidates.map(c => c.id), candidates.map(c => TOKENIZERS[tok](docTexts[c.i])), useIdf);
        const bm25 = normalizeBM25Scores(
          index.scores(TOKENIZERS[tok](q.text)).map((s, j) => ({ id: candidates[j].id, bm25Score: s }))
        );
        const fused = candidates
          .map((c, j) => ({ partId: c.id, score: hybridScore(c.score, bm25[j].bm25Score, alpha) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, PROD_TOP_K);

        // ws·IDF·후보 20개 구성은 프로덕션 hybridSearch와 순위가 같아야 한다
        if (tok === 'ws' && useIdf && n === PROD_TOP_K * 2 && bm25Doc === 'legacy') {
          const expected = hybridSearch(
            candidates.map(c => ({ id: c.id, score: c.score })),
            candidates.map(c => ({ id: c.id, text: texts[c.i] })),
            q.text,
            alpha
          ).slice(0, PROD_TOP_K);
          expected.forEach((e, j) => {
            if (Math.abs(e.score - fused[j].score) > 1e-9) throw new Error(`hybrid mismatch for ${q.id}`);
          });
        }
        return fused;
      }

      const bm25 = fullBm25For(tok, useIdf, bm25Doc)[qi];
      const vec = cosine[qi];
      let scores: number[];
      if (config.retrieval === 'union') {
        // 프로덕션 vector-search와 같은 형태: 각 검색기 상위 N개 → fuseRankedLists
        const n = config.candidates ?? 50;
        const top = (values: number[], keep: (i: number) => boolean) =>
          values.map((score, i) => ({ id: ids[i], score, i })).filter(h => keep(h.i))
            .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1)).slice(0, n)
            .map(({ id, score }) => ({ id, score }));
        let fused: Array<{ id: string; score: number }> = fuseRankedLists(top(vec, () => true), top(bm25, i => bm25[i] > 0), config.alpha ?? 0.5);
        if (config.constraintPenalty !== undefined) {
          const constraints = scopeConstraints(parsedFor(config)[qi], config.constraintScope ?? 'all');
          fused = rerankByConstraints(fused, id => attrsById.get(id), constraints, config.constraintPenalty, config.vehiclePenalty ?? 0.8);
        }
        return fused.slice(0, FULL_TOP_N).map(h => ({ partId: h.id, score: h.score }));
      }
      if (config.fusion === 'bm25') {
        scores = bm25;
      } else if (config.fusion === 'vector') {
        scores = vec;
      } else if (config.fusion === 'weighted') {
        const alpha = config.alpha ?? 0.5;
        const nv = minMax(vec);
        const nb = minMax(bm25);
        scores = nv.map((v, i) => alpha * v + (1 - alpha) * nb[i]);
      } else {
        const k = config.rrfK ?? 60;
        const vr = ranks(vec, () => true);
        const br = ranks(bm25, i => bm25[i] > 0); // BM25 점수 0은 검색되지 않은 문서
        scores = ids.map((_, i) => 1 / (k + vr.get(i)!) + (br.has(i) ? 1 / (k + br.get(i)!) : 0));
      }
      return scores
        .map((score, i) => ({ partId: ids[i], score }))
        .filter((_, i) => config.fusion !== 'bm25' || bm25[i] > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, FULL_TOP_N);
    });

  for (const config of configs) {
    const results = runConfig(config);
    const lines = queries.map((q, qi) => JSON.stringify({ qid: q.id, results: results[qi] }));
    writeFileSync(join(outDir, `${config.name}.jsonl`), lines.join('\n') + '\n', 'utf-8');
  }
  console.log(`ran ${configs.length} configurations (production BM25/hybrid parity checks passed)`);
}

main();
