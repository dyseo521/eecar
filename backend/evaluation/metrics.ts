/**
 * EECAR RAG Evaluation Metrics
 *
 * Implementation of standard IR (Information Retrieval) metrics
 * for evaluating RAG search quality.
 */

/**
 * Precision@K: Fraction of retrieved results that are relevant
 *
 * @example
 *   retrieved: [A, B, C, D, E], relevant: {A, C, F, G}
 *   Precision@5 = 2/5 = 0.4 (A and C are relevant)
 *
 * Interpretation: "Of the results we returned, how many were correct?"
 *
 * @param retrievedIds - Array of part IDs returned by search
 * @param relevantIds - Set of actually relevant part IDs
 * @param k - Number of top results to consider
 * @returns Precision score between 0 and 1
 */
export function precisionAtK(
  retrievedIds: string[],
  relevantIds: Set<string>,
  k: number
): number {
  if (k <= 0) return 0;

  const topK = retrievedIds.slice(0, k);
  if (topK.length === 0) return 0;

  const relevantInTopK = topK.filter(id => relevantIds.has(id)).length;
  return relevantInTopK / Math.min(k, topK.length);
}

/**
 * Recall@K: Fraction of relevant results that were retrieved
 *
 * @example
 *   retrieved: [A, B, C, D, E], relevant: {A, C, F, G}
 *   Recall@5 = 2/4 = 0.5 (found A and C out of 4 relevant)
 *
 * Interpretation: "Of all correct answers, how many did we find?"
 *
 * @param retrievedIds - Array of part IDs returned by search
 * @param relevantIds - Set of actually relevant part IDs
 * @param k - Number of top results to consider
 * @returns Recall score between 0 and 1
 */
export function recallAtK(
  retrievedIds: string[],
  relevantIds: Set<string>,
  k: number
): number {
  if (relevantIds.size === 0) return 0;
  if (k <= 0) return 0;

  const topK = retrievedIds.slice(0, k);
  const relevantInTopK = topK.filter(id => relevantIds.has(id)).length;
  return relevantInTopK / relevantIds.size;
}

/**
 * NDCG@K: Normalized Discounted Cumulative Gain
 *
 * Measures ranking quality - rewards relevant results appearing early.
 * Uses graded relevance scores (not binary).
 *
 * DCG = Σ (2^relevance - 1) / log2(rank + 1)
 * NDCG = DCG / IDCG (ideal DCG with perfect ranking)
 *
 * @example
 *   Retrieved: [A(rel=3), B(rel=0), C(rel=2), D(rel=1)]
 *   DCG = (2^3-1)/log2(2) + (2^0-1)/log2(3) + (2^2-1)/log2(4) + (2^1-1)/log2(5)
 *       = 7/1 + 0/1.58 + 3/2 + 1/2.32 = 8.93
 *   Ideal: [A(3), C(2), D(1), B(0)]
 *   IDCG = 7/1 + 3/1.58 + 1/2 + 0/2.32 = 9.4
 *   NDCG = 8.93 / 9.4 = 0.95
 *
 * @param retrievedIds - Array of part IDs returned by search
 * @param relevanceScores - Map of part ID to relevance score (0-3)
 * @param k - Number of top results to consider
 * @returns NDCG score between 0 and 1
 */
export function ndcgAtK(
  retrievedIds: string[],
  relevanceScores: Map<string, number>,
  k: number
): number {
  if (k <= 0) return 0;
  if (relevanceScores.size === 0) return 0;

  const topK = retrievedIds.slice(0, k);

  // Calculate DCG
  let dcg = 0;
  topK.forEach((id, i) => {
    const relevance = relevanceScores.get(id) || 0;
    // Using log base 2, rank is 1-indexed in formula
    dcg += (Math.pow(2, relevance) - 1) / Math.log2(i + 2);
  });

  // Calculate IDCG (ideal ordering)
  const idealScores = Array.from(relevanceScores.values())
    .sort((a, b) => b - a)
    .slice(0, k);

  let idcg = 0;
  idealScores.forEach((score, i) => {
    idcg += (Math.pow(2, score) - 1) / Math.log2(i + 2);
  });

  // Avoid division by zero
  return idcg === 0 ? 0 : dcg / idcg;
}

/**
 * MRR: Mean Reciprocal Rank
 *
 * For a single query, RR = 1 / (rank of first relevant result)
 * MRR is the average over multiple queries.
 *
 * @example
 *   Retrieved: [X, X, A, X, B] where A, B are relevant
 *   RR = 1/3 = 0.33 (first relevant at position 3)
 *
 * Interpretation: "How quickly do we show the first correct answer?"
 *
 * @param retrievedIds - Array of part IDs returned by search
 * @param relevantIds - Set of actually relevant part IDs
 * @returns Reciprocal rank between 0 and 1
 */
export function mrr(
  retrievedIds: string[],
  relevantIds: Set<string>
): number {
  if (relevantIds.size === 0) return 0;

  const firstRelevantIndex = retrievedIds.findIndex(id => relevantIds.has(id));

  // If no relevant result found, RR = 0
  if (firstRelevantIndex === -1) return 0;

  // Rank is 1-indexed
  return 1 / (firstRelevantIndex + 1);
}

/**
 * F1 Score: Harmonic mean of Precision and Recall
 *
 * F1 = 2 * (P * R) / (P + R)
 *
 * Balances precision and recall into a single metric.
 *
 * @param precision - Precision score
 * @param recall - Recall score
 * @returns F1 score between 0 and 1
 */
export function f1Score(precision: number, recall: number): number {
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

/**
 * Hit Rate@K: Whether any relevant result appears in top K
 *
 * Also known as "Success@K" - binary metric.
 *
 * @param retrievedIds - Array of part IDs returned by search
 * @param relevantIds - Set of actually relevant part IDs
 * @param k - Number of top results to consider
 * @returns 1 if any relevant result in top K, 0 otherwise
 */
export function hitRateAtK(
  retrievedIds: string[],
  relevantIds: Set<string>,
  k: number
): number {
  const topK = retrievedIds.slice(0, k);
  return topK.some(id => relevantIds.has(id)) ? 1 : 0;
}

/**
 * Mean Average Precision (MAP)
 *
 * Average of precision values at each relevant result position.
 *
 * @example
 *   Retrieved: [A, X, B, X, C] where A, B, C are relevant
 *   P@1 = 1/1 = 1.0 (A at position 1)
 *   P@3 = 2/3 = 0.67 (B at position 3)
 *   P@5 = 3/5 = 0.6 (C at position 5)
 *   AP = (1.0 + 0.67 + 0.6) / 3 = 0.76
 *
 * @param retrievedIds - Array of part IDs returned by search
 * @param relevantIds - Set of actually relevant part IDs
 * @returns Average precision between 0 and 1
 */
export function averagePrecision(
  retrievedIds: string[],
  relevantIds: Set<string>
): number {
  if (relevantIds.size === 0) return 0;

  let relevantFound = 0;
  let precisionSum = 0;

  for (let i = 0; i < retrievedIds.length; i++) {
    if (relevantIds.has(retrievedIds[i])) {
      relevantFound++;
      precisionSum += relevantFound / (i + 1);
    }
  }

  return relevantFound === 0 ? 0 : precisionSum / relevantIds.size;
}

/**
 * Cosine Similarity between two vectors
 *
 * Used for embedding comparison and clustering analysis.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Similarity score between -1 and 1
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (normA * normB);
}

/**
 * Calculate metrics for a set of evaluation results
 *
 * Aggregates individual query metrics into summary statistics.
 *
 * @param results - Array of query evaluation results
 * @param kValues - K values to compute metrics for
 * @returns Aggregated metrics
 */
export function aggregateMetrics(
  results: Array<{ metrics: Record<string, number> }>,
  kValues: number[]
): {
  avgPrecision: Record<string, number>;
  avgRecall: Record<string, number>;
  avgNDCG: Record<string, number>;
  avgMRR: number;
  avgLatencyMs: number;
} {
  const count = results.length;
  if (count === 0) {
    return {
      avgPrecision: {},
      avgRecall: {},
      avgNDCG: {},
      avgMRR: 0,
      avgLatencyMs: 0,
    };
  }

  const avgPrecision: Record<string, number> = {};
  const avgRecall: Record<string, number> = {};
  const avgNDCG: Record<string, number> = {};

  for (const k of kValues) {
    avgPrecision[`@${k}`] = average(results.map(r => r.metrics[`precision@${k}`] || 0));
    avgRecall[`@${k}`] = average(results.map(r => r.metrics[`recall@${k}`] || 0));
    avgNDCG[`@${k}`] = average(results.map(r => r.metrics[`ndcg@${k}`] || 0));
  }

  return {
    avgPrecision,
    avgRecall,
    avgNDCG,
    avgMRR: average(results.map(r => r.metrics.mrr || 0)),
    avgLatencyMs: average(results.map(r => r.metrics.latencyMs || 0)),
  };
}

/**
 * Calculate average of an array of numbers
 */
export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate standard deviation
 */
export function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = average(values);
  const squareDiffs = values.map(v => Math.pow(v - avg, 2));
  return Math.sqrt(average(squareDiffs));
}

/**
 * Calculate percentile (e.g., p50, p95, p99)
 *
 * @param values - Array of values
 * @param percentile - Percentile to calculate (0-100)
 * @returns Value at the given percentile
 */
export function percentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}
