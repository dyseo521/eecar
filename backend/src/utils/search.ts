/**
 * Hybrid Search Utilities
 * BM25 keyword scoring + Vector similarity for improved RAG accuracy
 */

/**
 * Simple Korean tokenizer (whitespace + common morphemes)
 * For production, consider using a proper Korean NLP library like mecab-ko
 */
export function tokenize(text: string): string[] {
  // Remove common Korean particles and connectors
  const stopWords = new Set([
    '이', '가', '은', '는', '을', '를', '의', '에', '와', '과', '도', '로', '으로',
    '에서', '까지', '부터', '하고', '이고', '인', '된', '등', '및', '또는', '그리고'
  ]);

  // Split by whitespace and punctuation
  const tokens = text
    .toLowerCase()
    .replace(/[^\w\s가-힣]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0 && !stopWords.has(t));

  return tokens;
}

const HANGUL = /[가-힣]/;

/**
 * 공백 토큰을 한글이면 글자 2-gram으로 나눈다. "배터리팩"과 "배터리 팩"이 "배터·터리"를 공유하게 되고,
 * 조사가 붙은 "배터리를"도 "배터·터리"로 맞는다 (DECISION_LOG E-25). 영문·숫자 토큰은 그대로 둔다.
 */
export function bigramTokenize(text: string): string[] {
  return tokenize(text).flatMap(token => {
    if (!HANGUL.test(token) || token.length < 2) return [token];
    const grams: string[] = [];
    for (let i = 0; i < token.length - 1; i++) grams.push(token.slice(i, i + 2));
    return grams;
  });
}

/** 검색 BM25 색인과 질의에 쓰는 토크나이저 */
export const SEARCH_TOKENIZER = bigramTokenize;

/**
 * Calculate term frequency in a document
 */
function termFrequency(term: string, docTokens: string[]): number {
  return docTokens.filter(t => t === term).length;
}

/**
 * Calculate inverse document frequency
 */
function inverseDocumentFrequency(
  term: string,
  allDocTokens: string[][]
): number {
  const docsWithTerm = allDocTokens.filter(tokens => tokens.includes(term)).length;
  const N = allDocTokens.length;

  // IDF with smoothing to avoid division by zero
  return Math.log((N - docsWithTerm + 0.5) / (docsWithTerm + 0.5) + 1);
}

/**
 * BM25 scoring algorithm
 * @param query - Search query text
 * @param document - Document text to score
 * @param avgDocLength - Average document length across corpus
 * @param docCount - Total number of documents
 * @param k1 - Term frequency saturation parameter (default 1.5)
 * @param b - Length normalization parameter (default 0.75)
 */
export function bm25Score(
  queryTokens: string[],
  docTokens: string[],
  allDocTokens: string[][],
  k1: number = 1.5,
  b: number = 0.75
): number {
  const avgDocLength = allDocTokens.reduce((sum, doc) => sum + doc.length, 0) / allDocTokens.length;
  const docLength = docTokens.length;

  let score = 0;

  for (const term of queryTokens) {
    const tf = termFrequency(term, docTokens);
    const idf = inverseDocumentFrequency(term, allDocTokens);

    // BM25 formula
    const tfNormalized = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / avgDocLength)));
    score += idf * tfNormalized;
  }

  return score;
}

/**
 * Calculate BM25 scores for all documents
 */
export function calculateBM25Scores(
  query: string,
  documents: Array<{ id: string; text: string }>
): Array<{ id: string; bm25Score: number }> {
  const queryTokens = tokenize(query);
  const allDocTokens = documents.map(d => tokenize(d.text));

  return documents.map((doc, index) => ({
    id: doc.id,
    bm25Score: bm25Score(queryTokens, allDocTokens[index], allDocTokens)
  }));
}

/**
 * Normalize BM25 scores to 0-1 range
 */
export function normalizeBM25Scores(
  scores: Array<{ id: string; bm25Score: number }>
): Array<{ id: string; bm25Score: number }> {
  if (scores.length === 0) return [];

  const maxScore = Math.max(...scores.map(s => s.bm25Score));
  const minScore = Math.min(...scores.map(s => s.bm25Score));

  if (maxScore === minScore) {
    return scores.map(s => ({ id: s.id, bm25Score: 1 }));
  }

  return scores.map(s => ({
    id: s.id,
    bm25Score: (s.bm25Score - minScore) / (maxScore - minScore)
  }));
}

/**
 * Combine vector similarity and BM25 scores using weighted average
 * @param vectorScore - Cosine similarity score (0-1)
 * @param bm25Score - Normalized BM25 score (0-1)
 * @param alpha - Weight for vector score (default 0.7, meaning 70% vector + 30% BM25)
 */
export function hybridScore(
  vectorScore: number,
  bm25Score: number,
  alpha: number = 0.7
): number {
  return alpha * vectorScore + (1 - alpha) * bm25Score;
}

/**
 * @deprecated 이전 검색 구조 (벡터 후보 안에서만 BM25, 벡터 점수 비정규화). 평가 기준선 재현에만 쓴다.
 * 새 코드는 fuseRankedLists
 *
 * Perform hybrid search combining vector and BM25 results
 */
export function hybridSearch(
  vectorResults: Array<{ id: string; score: number }>,
  documents: Array<{ id: string; text: string }>,
  query: string,
  alpha: number = 0.7
): Array<{ id: string; score: number; vectorScore: number; bm25Score: number }> {
  // Calculate and normalize BM25 scores
  const bm25Scores = calculateBM25Scores(query, documents);
  const normalizedBM25 = normalizeBM25Scores(bm25Scores);

  // Create a map for quick BM25 lookup
  const bm25Map = new Map(normalizedBM25.map(s => [s.id, s.bm25Score]));

  // Combine scores
  return vectorResults.map(result => {
    const bm25 = bm25Map.get(result.id) || 0;
    return {
      id: result.id,
      score: hybridScore(result.score, bm25, alpha),
      vectorScore: result.score,
      bm25Score: bm25
    };
  }).sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// 독립 검색 + 결합 (DECISION_LOG E-23)
//
// 이전 구조(hybridSearch)는 벡터 상위 20개 안에서만 BM25를 계산하고 벡터 점수는 정규화하지 않았다.
// 벡터 상위 20개의 코사인 범위가 중앙값 0.16이라, 0~1로 펴진 BM25가 순위의 약 72%를 결정했다(명목 30%).
// 이제 두 검색기가 각자 상위 N개를 찾고, 각 목록 안에서 같은 방식으로 정규화한 뒤 결합한다.
// ---------------------------------------------------------------------------

/** 결합 비율 α (벡터 비중). v2 dev 질의에서 선택, test에서 확인 (E-23) */
export const HYBRID_ALPHA = 0.5;
/** 검색기별 후보 수. S3 Vectors QueryVectors 한 페이지 최대 100건 (공식 한도) */
export const CANDIDATES_PER_RETRIEVER = 100;

export interface RankedHit {
  id: string;
  score: number;
}

export interface FusedHit {
  id: string;
  score: number;
  /** 목록 안에서 정규화한 벡터 점수 (목록에 없으면 0) */
  vectorScore: number;
  /** 목록 안에서 정규화한 BM25 점수 (목록에 없으면 0) */
  bm25Score: number;
}

/**
 * 문서 집합에 대한 BM25 색인. 문서 빈도를 미리 계산해 두고 질의마다 점수만 계산한다.
 * 점수식은 bm25Score와 같다 (k1=1.5, b=0.75, idf=ln((N-df+0.5)/(df+0.5)+1)).
 */
export class Bm25Index {
  private readonly df = new Map<string, number>();
  private readonly tf: Array<Map<string, number>>;
  private readonly lengths: number[];
  private readonly avgLength: number;

  constructor(
    private readonly ids: string[],
    docTokens: string[][],
    private readonly useIdf = true,
    private readonly k1 = 1.5,
    private readonly b = 0.75
  ) {
    this.tf = docTokens.map(tokens => {
      const counts = new Map<string, number>();
      for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
      for (const t of counts.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      return counts;
    });
    this.lengths = docTokens.map(t => t.length);
    this.avgLength = docTokens.length ? this.lengths.reduce((a, b) => a + b, 0) / docTokens.length : 0;
  }

  static fromTexts(docs: Array<{ id: string; text: string }>, tokenizer: (text: string) => string[] = SEARCH_TOKENIZER): Bm25Index {
    return new Bm25Index(docs.map(d => d.id), docs.map(d => tokenizer(d.text)));
  }

  get size(): number {
    return this.ids.length;
  }

  /** 모든 문서의 점수 (색인 순서) */
  scores(queryTokens: string[]): number[] {
    const n = this.ids.length;
    const idfs = queryTokens.map(term => {
      if (!this.useIdf) return 1;
      const df = this.df.get(term) ?? 0;
      return Math.log((n - df + 0.5) / (df + 0.5) + 1);
    });
    return this.tf.map((counts, i) => {
      let score = 0;
      queryTokens.forEach((term, j) => {
        const tf = counts.get(term) ?? 0;
        if (tf === 0) return;
        score += idfs[j] * (tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * (this.lengths[i] / this.avgLength)));
      });
      return score;
    });
  }

  /** 점수가 0보다 큰 문서 상위 limit개 (점수 0은 검색되지 않은 문서) */
  search(query: string, limit: number, tokenizer: (text: string) => string[] = SEARCH_TOKENIZER): RankedHit[] {
    return this.scores(tokenizer(query))
      .map((score, i) => ({ id: this.ids[i], score }))
      .filter(hit => hit.score > 0)
      .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
      .slice(0, limit);
  }
}

function minMaxNormalize(hits: RankedHit[]): Map<string, number> {
  if (hits.length === 0) return new Map();
  const max = Math.max(...hits.map(h => h.score));
  const min = Math.min(...hits.map(h => h.score));
  // 점수가 모두 같으면 목록 안에서는 구분할 수 없으므로 모두 1 (목록에 든 것 자체가 신호)
  return new Map(hits.map(h => [h.id, max === min ? 1 : (h.score - min) / (max - min)]));
}

/**
 * 두 검색기의 상위 목록을 볼록 결합한다: α·norm(벡터) + (1-α)·norm(BM25).
 * 각 목록 안에서 min-max 정규화하고, 한쪽 목록에만 있는 문서는 다른 쪽 점수를 0으로 둔다
 * (Bruch et al., ACM TOIS 2023의 convex combination. 정규화 범위를 목록으로 한정한 것은
 * 검색기가 상위 N개만 돌려주는 프로덕션 제약 때문이다).
 */
export function fuseRankedLists(vector: RankedHit[], bm25: RankedHit[], alpha: number = HYBRID_ALPHA): FusedHit[] {
  const nv = minMaxNormalize(vector);
  const nb = minMaxNormalize(bm25);
  const ids = [...new Set([...vector.map(h => h.id), ...bm25.map(h => h.id)])];
  return ids
    .map(id => {
      const vectorScore = nv.get(id) ?? 0;
      const bm25Score = nb.get(id) ?? 0;
      return { id, score: alpha * vectorScore + (1 - alpha) * bm25Score, vectorScore, bm25Score };
    })
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
}

/**
 * @deprecated 이전 검색 구조의 BM25 텍스트. 평가 기준선 재현에만 쓴다. 새 코드는 search-document.ts의 buildSearchText
 *
 * Prepare part data for BM25 indexing
 * Creates searchable text from part metadata
 */
export function preparePartForBM25(part: any): string {
  const sections = [
    part.name || '',
    part.category || '',
    part.manufacturer || '',
    part.model || '',
    part.description || '',
  ];

  // Add specifications if available
  if (part.specifications) {
    const spec = part.specifications;
    if (spec.materialComposition?.primary) {
      sections.push(spec.materialComposition.primary);
    }
    if (spec.electricalProps) {
      sections.push(`${spec.electricalProps.voltage}V`);
      sections.push(`${spec.electricalProps.capacity}Ah`);
    }
  }

  // Add battery health info if available
  if (part.batteryHealth) {
    sections.push(`SOH ${part.batteryHealth.soh}%`);
    if (part.batteryHealth.cathodeType) {
      sections.push(part.batteryHealth.cathodeType);
    }
  }

  return sections.filter(s => s).join(' ');
}
