/**
 * Unit tests for RAG Evaluation Metrics
 */

import {
  precisionAtK,
  recallAtK,
  ndcgAtK,
  mrr,
  f1Score,
  hitRateAtK,
  averagePrecision,
  cosineSimilarity,
  average,
  standardDeviation,
  percentile,
} from '../../evaluation/metrics.js';

describe('RAG Evaluation Metrics', () => {
  // Test data setup
  // Scenario: Search returned [A, B, C, D, E] and relevant items are {A, C, F, G}
  const retrieved = ['part1', 'part2', 'part3', 'part4', 'part5'];
  const relevant = new Set(['part1', 'part3', 'part6', 'part7']);
  const relevanceScores = new Map([
    ['part1', 3], // Highly relevant
    ['part3', 2], // Relevant
    ['part6', 2], // Relevant (not retrieved)
    ['part7', 1], // Marginally relevant (not retrieved)
  ]);

  describe('precisionAtK', () => {
    it('should calculate P@1 correctly when first result is relevant', () => {
      expect(precisionAtK(retrieved, relevant, 1)).toBe(1.0);
    });

    it('should calculate P@3 correctly', () => {
      // Top 3: [part1, part2, part3], relevant: part1, part3
      // Precision@3 = 2/3 ≈ 0.67
      expect(precisionAtK(retrieved, relevant, 3)).toBeCloseTo(0.67, 2);
    });

    it('should calculate P@5 correctly', () => {
      // Top 5: [part1, part2, part3, part4, part5], relevant: part1, part3
      // Precision@5 = 2/5 = 0.4
      expect(precisionAtK(retrieved, relevant, 5)).toBe(0.4);
    });

    it('should return 0 when no relevant results in top K', () => {
      const noRelevant = new Set(['partX', 'partY']);
      expect(precisionAtK(retrieved, noRelevant, 5)).toBe(0);
    });

    it('should handle empty retrieved list', () => {
      expect(precisionAtK([], relevant, 5)).toBe(0);
    });

    it('should handle K larger than retrieved list', () => {
      expect(precisionAtK(['part1', 'part3'], relevant, 10)).toBe(1.0);
    });

    it('should return 0 for K=0', () => {
      expect(precisionAtK(retrieved, relevant, 0)).toBe(0);
    });
  });

  describe('recallAtK', () => {
    it('should calculate R@1 correctly', () => {
      // Top 1: [part1], relevant: {part1, part3, part6, part7}
      // Recall@1 = 1/4 = 0.25
      expect(recallAtK(retrieved, relevant, 1)).toBe(0.25);
    });

    it('should calculate R@5 correctly', () => {
      // Top 5 contains part1, part3 out of 4 relevant
      // Recall@5 = 2/4 = 0.5
      expect(recallAtK(retrieved, relevant, 5)).toBe(0.5);
    });

    it('should return 0 when no relevant items exist', () => {
      const emptyRelevant = new Set<string>();
      expect(recallAtK(retrieved, emptyRelevant, 5)).toBe(0);
    });

    it('should return 1 when all relevant items are in top K', () => {
      const allInTop = new Set(['part1', 'part2']);
      expect(recallAtK(retrieved, allInTop, 5)).toBe(1.0);
    });

    it('should handle empty retrieved list', () => {
      expect(recallAtK([], relevant, 5)).toBe(0);
    });
  });

  describe('ndcgAtK', () => {
    it('should return value between 0 and 1', () => {
      const ndcg = ndcgAtK(retrieved, relevanceScores, 5);
      expect(ndcg).toBeGreaterThanOrEqual(0);
      expect(ndcg).toBeLessThanOrEqual(1);
    });

    it('should return 1 for perfect ranking', () => {
      // Ideal order: part1 (3), part3 (2), part6 (2), part7 (1)
      const perfectOrder = ['part1', 'part3', 'part6', 'part7'];
      const ndcg = ndcgAtK(perfectOrder, relevanceScores, 4);
      expect(ndcg).toBeCloseTo(1.0, 5);
    });

    it('should penalize relevant items appearing later', () => {
      const goodOrder = ['part1', 'part3', 'part2', 'part4'];
      const badOrder = ['part2', 'part4', 'part1', 'part3'];

      const goodNDCG = ndcgAtK(goodOrder, relevanceScores, 4);
      const badNDCG = ndcgAtK(badOrder, relevanceScores, 4);

      expect(goodNDCG).toBeGreaterThan(badNDCG);
    });

    it('should return 0 when no relevant items in results', () => {
      const noRelevant = ['partX', 'partY', 'partZ'];
      const ndcg = ndcgAtK(noRelevant, relevanceScores, 3);
      expect(ndcg).toBe(0);
    });

    it('should return 0 for empty relevance scores', () => {
      const emptyScores = new Map<string, number>();
      expect(ndcgAtK(retrieved, emptyScores, 5)).toBe(0);
    });

    it('should handle K=0', () => {
      expect(ndcgAtK(retrieved, relevanceScores, 0)).toBe(0);
    });
  });

  describe('mrr', () => {
    it('should return 1 when first result is relevant', () => {
      expect(mrr(retrieved, relevant)).toBe(1.0);
    });

    it('should return 0.5 when first relevant is at position 2', () => {
      const reordered = ['part2', 'part1', 'part3'];
      expect(mrr(reordered, relevant)).toBe(0.5);
    });

    it('should return 0.33 when first relevant is at position 3', () => {
      const reordered = ['part2', 'part4', 'part1', 'part3'];
      expect(mrr(reordered, relevant)).toBeCloseTo(0.33, 2);
    });

    it('should return 0 when no relevant results', () => {
      const noRelevant = ['part2', 'part4', 'part5'];
      expect(mrr(noRelevant, relevant)).toBe(0);
    });

    it('should return 0 for empty relevant set', () => {
      expect(mrr(retrieved, new Set())).toBe(0);
    });

    it('should handle empty retrieved list', () => {
      expect(mrr([], relevant)).toBe(0);
    });
  });

  describe('f1Score', () => {
    it('should calculate harmonic mean correctly', () => {
      // F1 = 2 * (0.8 * 0.6) / (0.8 + 0.6) = 0.96 / 1.4 ≈ 0.686
      expect(f1Score(0.8, 0.6)).toBeCloseTo(0.686, 2);
    });

    it('should return 1 when both precision and recall are 1', () => {
      expect(f1Score(1.0, 1.0)).toBe(1.0);
    });

    it('should return 0 when either precision or recall is 0', () => {
      expect(f1Score(0, 0.5)).toBe(0);
      expect(f1Score(0.5, 0)).toBe(0);
    });

    it('should return 0 when both are 0', () => {
      expect(f1Score(0, 0)).toBe(0);
    });

    it('should be symmetric', () => {
      expect(f1Score(0.8, 0.6)).toBeCloseTo(f1Score(0.6, 0.8), 5);
    });
  });

  describe('hitRateAtK', () => {
    it('should return 1 when any relevant result in top K', () => {
      expect(hitRateAtK(retrieved, relevant, 1)).toBe(1);
      expect(hitRateAtK(retrieved, relevant, 5)).toBe(1);
    });

    it('should return 0 when no relevant results in top K', () => {
      const farRelevant = new Set(['part10', 'part11']);
      expect(hitRateAtK(retrieved, farRelevant, 5)).toBe(0);
    });

    it('should return 0 for empty retrieved list', () => {
      expect(hitRateAtK([], relevant, 5)).toBe(0);
    });
  });

  describe('averagePrecision', () => {
    it('should calculate AP correctly', () => {
      // Retrieved: [A, X, B, X, C] where A, B, C are relevant
      // P@1 = 1/1 = 1.0 (A)
      // P@3 = 2/3 ≈ 0.67 (B)
      // P@5 = 3/5 = 0.6 (C)
      // AP = (1.0 + 0.67 + 0.6) / 3 ≈ 0.76
      const retrievedAP = ['A', 'X', 'B', 'X', 'C'];
      const relevantAP = new Set(['A', 'B', 'C']);
      expect(averagePrecision(retrievedAP, relevantAP)).toBeCloseTo(0.756, 2);
    });

    it('should return 1 when perfect retrieval order', () => {
      const perfectRetrieved = ['A', 'B', 'C'];
      const perfectRelevant = new Set(['A', 'B', 'C']);
      expect(averagePrecision(perfectRetrieved, perfectRelevant)).toBe(1.0);
    });

    it('should return 0 when no relevant items', () => {
      expect(averagePrecision(retrieved, new Set())).toBe(0);
    });

    it('should return 0 when no relevant items retrieved', () => {
      const noRelevant = new Set(['X', 'Y', 'Z']);
      expect(averagePrecision(retrieved, noRelevant)).toBe(0);
    });
  });

  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      const v = [1, 2, 3];
      expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      const v1 = [1, 0, 0];
      const v2 = [0, 1, 0];
      expect(cosineSimilarity(v1, v2)).toBeCloseTo(0, 5);
    });

    it('should return -1 for opposite vectors', () => {
      const v1 = [1, 2, 3];
      const v2 = [-1, -2, -3];
      expect(cosineSimilarity(v1, v2)).toBeCloseTo(-1.0, 5);
    });

    it('should be symmetric', () => {
      const v1 = [1, 2, 3];
      const v2 = [4, 5, 6];
      expect(cosineSimilarity(v1, v2)).toBeCloseTo(cosineSimilarity(v2, v1), 5);
    });

    it('should throw error for different length vectors', () => {
      const v1 = [1, 2, 3];
      const v2 = [1, 2];
      expect(() => cosineSimilarity(v1, v2)).toThrow('Vectors must have the same length');
    });

    it('should return 0 for zero vectors', () => {
      const v1 = [0, 0, 0];
      const v2 = [1, 2, 3];
      expect(cosineSimilarity(v1, v2)).toBe(0);
    });
  });

  describe('average', () => {
    it('should calculate average correctly', () => {
      expect(average([1, 2, 3, 4, 5])).toBe(3);
    });

    it('should return 0 for empty array', () => {
      expect(average([])).toBe(0);
    });

    it('should handle single element', () => {
      expect(average([42])).toBe(42);
    });

    it('should handle negative numbers', () => {
      expect(average([-1, 0, 1])).toBe(0);
    });
  });

  describe('standardDeviation', () => {
    it('should calculate std dev correctly', () => {
      // Population: [2, 4, 4, 4, 5, 5, 7, 9]
      // Mean = 5, Variance = 4, StdDev = 2
      expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 1);
    });

    it('should return 0 for empty array', () => {
      expect(standardDeviation([])).toBe(0);
    });

    it('should return 0 for single element', () => {
      expect(standardDeviation([42])).toBe(0);
    });

    it('should return 0 for identical values', () => {
      expect(standardDeviation([5, 5, 5, 5])).toBe(0);
    });
  });

  describe('percentile', () => {
    it('should calculate p50 (median) correctly for odd length', () => {
      expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    });

    it('should calculate p50 correctly for even length', () => {
      expect(percentile([1, 2, 3, 4], 50)).toBe(2);
    });

    it('should calculate p95 correctly', () => {
      const values = Array.from({ length: 100 }, (_, i) => i + 1);
      expect(percentile(values, 95)).toBe(95);
    });

    it('should calculate p99 correctly', () => {
      const values = Array.from({ length: 100 }, (_, i) => i + 1);
      expect(percentile(values, 99)).toBe(99);
    });

    it('should return 0 for empty array', () => {
      expect(percentile([], 50)).toBe(0);
    });

    it('should not modify original array', () => {
      const original = [5, 1, 3, 2, 4];
      const copy = [...original];
      percentile(original, 50);
      expect(original).toEqual(copy);
    });
  });
});

describe('Integration Scenarios', () => {
  describe('Realistic search evaluation', () => {
    it('should evaluate a typical search result correctly', () => {
      // Scenario: User searches for "고용량 배터리"
      // Retrieved: [battery-007, battery-001, motor-001, battery-003, body-001]
      // Relevant: [battery-007, battery-001, battery-003] with scores [3, 2, 2]
      const retrieved = ['battery-007', 'battery-001', 'motor-001', 'battery-003', 'body-001'];
      const relevant = new Set(['battery-007', 'battery-001', 'battery-003']);
      const relevanceScores = new Map([
        ['battery-007', 3],
        ['battery-001', 2],
        ['battery-003', 2],
      ]);

      // P@5 = 3/5 = 0.6
      expect(precisionAtK(retrieved, relevant, 5)).toBe(0.6);

      // R@5 = 3/3 = 1.0 (all relevant found)
      expect(recallAtK(retrieved, relevant, 5)).toBe(1.0);

      // MRR = 1/1 = 1.0 (first result is relevant)
      expect(mrr(retrieved, relevant)).toBe(1.0);

      // NDCG should be high but not perfect (motor-001 in position 3)
      const ndcg = ndcgAtK(retrieved, relevanceScores, 5);
      expect(ndcg).toBeGreaterThan(0.8);
      expect(ndcg).toBeLessThan(1.0);
    });

    it('should detect poor search quality', () => {
      // Scenario: Search returns irrelevant results
      const retrieved = ['motor-001', 'inverter-001', 'body-001', 'battery-007', 'battery-003'];
      const relevant = new Set(['battery-007', 'battery-003', 'battery-001']);

      // P@3 = 0/3 = 0 (no relevant in top 3)
      expect(precisionAtK(retrieved, relevant, 3)).toBe(0);

      // MRR = 1/4 = 0.25 (first relevant at position 4)
      expect(mrr(retrieved, relevant)).toBe(0.25);
    });
  });
});
