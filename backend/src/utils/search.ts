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

/**
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
