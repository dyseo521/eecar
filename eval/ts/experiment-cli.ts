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
 *   tokenizer  ws | bigram | ws+bigram   (ws = 프로덕션 tokenize)
 *   idf        false면 IDF를 1로 고정 (가설 검증용 변형)
 *
 * BM25는 질의 수 × 구성 수만큼 반복하므로 문서 빈도를 미리 계산한 구현을 쓴다.
 * 점수식(k1=1.5, b=0.75, idf=ln((N-df+0.5)/(df+0.5)+1))은 프로덕션 bm25Score와 같고,
 * 실행할 때마다 ws 토크나이저 결과를 프로덕션 calculateBM25Scores·hybridSearch와 대조해 다르면 중단한다.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  calculateBM25Scores,
  hybridScore,
  hybridSearch,
  normalizeBM25Scores,
  preparePartForBM25,
  tokenize,
} from '../../backend/src/utils/search.js';
import { cosineSimilarity } from '../../backend/src/utils/bedrock.js';

type Tokenizer = 'ws' | 'bigram' | 'ws+bigram';

interface Config {
  name: string;
  retrieval: 'prod' | 'full';
  fusion: 'weighted' | 'rrf' | 'bm25' | 'vector';
  alpha?: number;
  rrfK?: number;
  candidates?: number;
  tokenizer?: Tokenizer;
  idf?: boolean;
}

interface Ranked {
  partId: string;
  score: number;
}

const K1 = 1.5;
const B = 0.75;
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
  bigram: text => tokenize(text).flatMap(charBigrams),
  'ws+bigram': text =>
    tokenize(text).flatMap(token => {
      const grams = charBigrams(token);
      return grams.length === 1 && grams[0] === token ? [token] : [token, ...grams];
    }),
};

/** 문서 집합에 대한 BM25 색인 (프로덕션 bm25Score와 같은 식) */
class Bm25Index {
  private readonly df = new Map<string, number>();
  private readonly tf: Array<Map<string, number>>;
  private readonly lengths: number[];
  private readonly avgLength: number;

  constructor(private readonly docTokens: string[][], private readonly useIdf = true) {
    this.tf = docTokens.map(tokens => {
      const counts = new Map<string, number>();
      for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
      for (const t of counts.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      return counts;
    });
    this.lengths = docTokens.map(t => t.length);
    this.avgLength = this.lengths.reduce((a, b) => a + b, 0) / docTokens.length;
  }

  private idf(term: string): number {
    if (!this.useIdf) return 1;
    const n = this.docTokens.length;
    const df = this.df.get(term) ?? 0;
    return Math.log((n - df + 0.5) / (df + 0.5) + 1);
  }

  scores(queryTokens: string[]): number[] {
    const idfs = queryTokens.map(t => this.idf(t));
    return this.tf.map((counts, i) => {
      let score = 0;
      queryTokens.forEach((term, j) => {
        const tf = counts.get(term) ?? 0;
        const norm = (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (this.lengths[i] / this.avgLength)));
        score += idfs[j] * norm;
      });
      return score;
    });
  }
}

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
  const texts = parts.map(p => preparePartForBM25(p));
  const ids = parts.map(p => p.partId);

  // 질의 x 문서 코사인 유사도 (프로덕션 cosineSimilarity)
  const cosine = queries.map(q => parts.map(p => cosineSimilarity(cache.queries[q.id], cache.docs[p.partId])));

  // 토크나이저·IDF 조합별 전체 코퍼스 BM25 점수
  const docTokensBy = new Map<Tokenizer, string[][]>();
  const fullBm25 = new Map<string, number[][]>();
  const fullBm25For = (tok: Tokenizer, useIdf: boolean): number[][] => {
    const key = `${tok}|${useIdf}`;
    if (!fullBm25.has(key)) {
      if (!docTokensBy.has(tok)) docTokensBy.set(tok, texts.map(t => TOKENIZERS[tok](t)));
      const index = new Bm25Index(docTokensBy.get(tok)!, useIdf);
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

      if (config.retrieval === 'prod') {
        const n = config.candidates ?? PROD_TOP_K * 2;
        const alpha = config.alpha ?? 0.7;
        const candidates = cosine[qi]
          .map((score, i) => ({ id: ids[i], score, i }))
          .sort((a, b) => b.score - a.score)
          .slice(0, n);
        const index = new Bm25Index(candidates.map(c => TOKENIZERS[tok](texts[c.i])), useIdf);
        const bm25 = normalizeBM25Scores(
          index.scores(TOKENIZERS[tok](q.text)).map((s, j) => ({ id: candidates[j].id, bm25Score: s }))
        );
        const fused = candidates
          .map((c, j) => ({ partId: c.id, score: hybridScore(c.score, bm25[j].bm25Score, alpha) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, PROD_TOP_K);

        // ws·IDF·후보 20개 구성은 프로덕션 hybridSearch와 순위가 같아야 한다
        if (tok === 'ws' && useIdf && n === PROD_TOP_K * 2) {
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

      const bm25 = fullBm25For(tok, useIdf)[qi];
      const vec = cosine[qi];
      let scores: number[];
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
