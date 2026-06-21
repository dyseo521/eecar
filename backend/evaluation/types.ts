/**
 * EECAR RAG Evaluation System - Type Definitions
 *
 * Defines all types needed for offline and online RAG performance evaluation.
 */

// ==================== Golden Dataset Types ====================

/**
 * Golden dataset structure for offline evaluation
 */
export interface GoldenDataset {
  version: string;
  createdAt: string;
  description: string;
  queries: GoldenQuery[];
  metadata: DatasetMetadata;
}

/**
 * A single test query with expected results
 */
export interface GoldenQuery {
  /** Unique identifier for this query */
  id: string;

  /** The search query text */
  query: string;

  /** Optional category filter */
  category?: string;

  /** Parts that should be returned (ground truth) */
  expectedRelevantParts: ExpectedPart[];

  /** Parts that should NOT be returned (negative examples) */
  irrelevantParts?: IrrelevantPart[];

  /** Query difficulty level */
  difficulty: 'easy' | 'medium' | 'hard';

  /** Query type for analysis */
  queryType: 'semantic' | 'keyword' | 'mixed';
}

/**
 * Expected relevant part with relevance score
 */
export interface ExpectedPart {
  /** Part ID in the system */
  partId: string;

  /**
   * Relevance score (graded relevance)
   * - 3: Highly relevant (perfect match)
   * - 2: Relevant (partial match or good alternative)
   * - 1: Marginally relevant (indirect relevance)
   */
  relevanceScore: 1 | 2 | 3;

  /** Human explanation for the relevance rating */
  reason: string;
}

/**
 * Irrelevant part (negative example)
 */
export interface IrrelevantPart {
  partId: string;
  reason: string;
}

/**
 * Dataset metadata for analysis
 */
export interface DatasetMetadata {
  totalQueries: number;
  byDifficulty: Record<string, number>;
  byQueryType: Record<string, number>;
  byCategory: Record<string, number>;
}

// ==================== Evaluation Result Types ====================

/**
 * Result of evaluating a single query
 */
export interface QueryResult {
  /** Query ID from golden dataset */
  queryId: string;

  /** The query text */
  query: string;

  /** Difficulty level */
  difficulty: 'easy' | 'medium' | 'hard';

  /** Query type */
  queryType: 'semantic' | 'keyword' | 'mixed';

  /** Response latency in milliseconds */
  latencyMs: number;

  /** Whether result was from cache */
  cached: boolean;

  /** Computed metrics for this query */
  metrics: Record<string, number>;

  /** Part IDs returned by search */
  retrievedIds: string[];

  /** Expanded queries (if query expansion was used) */
  expandedQueries?: string[];
}

/**
 * Complete evaluation report
 */
export interface EvaluationReport {
  /** When the evaluation was run */
  timestamp: string;

  /** Evaluation configuration used */
  config: EvaluationConfig;

  /** Overall aggregated metrics */
  overall: OverallMetrics;

  /** Metrics broken down by difficulty */
  byDifficulty: Record<string, GroupMetrics>;

  /** Metrics broken down by query type */
  byQueryType: Record<string, GroupMetrics>;

  /** Individual query results */
  queryResults: QueryResult[];

  /** Queries that need improvement (bottom 20%) */
  needsImprovement: QueryResult[];
}

/**
 * Overall aggregated metrics
 */
export interface OverallMetrics {
  avgPrecision: Record<string, number>;
  avgRecall: Record<string, number>;
  avgNDCG: Record<string, number>;
  avgMRR: number;
  avgLatencyMs: number;
  cacheHitRate: number;
}

/**
 * Metrics for a group (by difficulty, query type, etc.)
 */
export interface GroupMetrics {
  count: number;
  avgPrecision5: number;
  avgRecall10: number;
  avgMRR: number;
  avgLatencyMs?: number;
}

/**
 * Configuration for evaluation run
 */
export interface EvaluationConfig {
  /** Path to golden dataset JSON */
  goldenDatasetPath: string;

  /** Path to save output report */
  outputPath: string;

  /** K values to compute metrics for */
  kValues: number[];

  /** API endpoint to test */
  apiEndpoint: string;

  /** Whether to print verbose output */
  verbose: boolean;
}

// ==================== Online Monitoring Types ====================

/**
 * Metrics collected during search
 */
export interface SearchMetrics {
  /** The search query */
  query: string;

  /** Total latency in ms */
  latencyMs: number;

  /** Number of results returned */
  resultCount: number;

  /** Whether result was from cache */
  cacheHit: boolean;

  /** Highest score in results */
  topScore: number;

  /** Average score of all results */
  avgScore: number;

  /** Number of expanded queries generated */
  queryExpansionCount: number;

  /** Time breakdown (optional) */
  embeddingTimeMs?: number;
  vectorSearchTimeMs?: number;
  bm25TimeMs?: number;
  aiGenerationTimeMs?: number;
}

/**
 * User feedback on search results
 */
export interface SearchFeedback {
  /** Unique feedback ID */
  feedbackId: string;

  /** The search query */
  searchQuery: string;

  /** Part ID that was clicked/selected */
  selectedPartId: string;

  /** Position of clicked result (1-indexed) */
  resultRank: number;

  /** User action type */
  action: 'click' | 'inquiry' | 'proposal' | 'skip';

  /** Session ID for grouping */
  searchSessionId: string;

  /** Optional user ID */
  userId?: string;

  /** When feedback was recorded */
  timestamp: string;
}

// ==================== Query Expansion Evaluation Types ====================

/**
 * Metrics comparing original vs expanded query performance
 */
export interface QueryExpansionMetrics {
  /** Original query */
  query: string;

  /** Original query results */
  original: {
    resultIds: string[];
    precision5: number;
    recall10: number;
    latencyMs: number;
  };

  /** Expanded query results */
  expanded: {
    expandedQueries: string[];
    resultIds: string[];
    precision5: number;
    recall10: number;
    latencyMs: number;
  };

  /** Comparison metrics */
  comparison: {
    /** (expanded - original) / original */
    recallImprovement: number;

    /** expanded - original */
    precisionChange: number;

    /** Parts found only with expansion */
    newlyFoundParts: string[];

    /** Parts in original but not expanded */
    lostParts: string[];

    /** Additional latency from expansion */
    additionalLatencyMs: number;

    /** Whether expansion was worth it */
    worthIt: boolean;
  };
}

// ==================== Embedding Quality Types ====================

/**
 * Clustering quality metrics for embeddings
 */
export interface ClusteringMetrics {
  /** Average similarity within each category */
  intraCategorySimilarity: Map<string, number>;

  /** Average similarity between categories */
  interCategorySimilarity: number;

  /** Silhouette score (-1 to 1, higher is better) */
  silhouetteScore: number;

  /** KNN classification accuracy */
  knnAccuracy: number;
}

/**
 * Point for 2D visualization
 */
export interface VisualizationPoint {
  partId: string;
  name: string;
  category: string;
  manufacturer: string;
  x: number;
  y: number;
}

// ==================== Cache Analysis Types ====================

/**
 * Cache effectiveness analysis
 */
export interface CacheAnalysis {
  /** Analysis period */
  period: string;

  /** Total number of queries */
  totalQueries: number;

  /** Number of unique queries */
  uniqueQueries: number;

  /** Number of cache hits */
  cacheHits: number;

  /** Number of cache misses */
  cacheMisses: number;

  /** Cache hit rate (0-1) */
  hitRate: number;

  /** Cost savings from caching */
  savings: {
    /** Bedrock API calls saved */
    bedrockCalls: number;

    /** Estimated cost saved in USD */
    estimatedCostUSD: number;

    /** Latency saved in ms */
    latencySavedMs: number;
  };

  /** Most frequently hit queries */
  topQueries: Array<{ query: string; hitCount: number }>;

  /** Queries with low hit count (cache inefficient) */
  lowHitQueries: Array<{ query: string; hitCount: number }>;
}

// ==================== A/B Test Types ====================

/**
 * A/B test configuration
 */
export interface ABTestConfig {
  testId: string;
  control: Record<string, any>;
  treatment: Record<string, any>;
}

/**
 * A/B test result
 */
export interface ABTestResult {
  testId: string;
  variant: 'control' | 'treatment';
  sessionId: string;
  metrics: Record<string, number>;
  timestamp: string;
}
