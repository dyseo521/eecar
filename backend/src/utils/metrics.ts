/**
 * CloudWatch Custom Metrics for RAG Search Performance
 *
 * Publishes search performance metrics to CloudWatch for real-time monitoring.
 */

import { CloudWatchClient, PutMetricDataCommand, MetricDatum } from '@aws-sdk/client-cloudwatch';

// Initialize CloudWatch client
const cloudwatch = new CloudWatchClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });

// Namespace for all EECAR RAG metrics
const NAMESPACE = 'EECAR/RAG';

/**
 * Search metrics collected during a search request
 */
export interface SearchMetrics {
  /** The search query */
  query: string;

  /** Total response latency in ms */
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
 * Publish search metrics to CloudWatch
 *
 * Metrics are published asynchronously to avoid impacting response latency.
 * Failures are logged but don't throw errors.
 *
 * @param metrics - Search metrics to publish
 */
export async function publishSearchMetrics(metrics: SearchMetrics): Promise<void> {
  const stage = process.env.STAGE || 'dev';
  const baseDimensions = [{ Name: 'Environment', Value: stage }];

  const metricData: MetricDatum[] = [
    // Response latency with cache hit dimension
    {
      MetricName: 'SearchLatency',
      Value: metrics.latencyMs,
      Unit: 'Milliseconds',
      Dimensions: [
        ...baseDimensions,
        { Name: 'CacheHit', Value: String(metrics.cacheHit) },
      ],
    },

    // Result count
    {
      MetricName: 'ResultCount',
      Value: metrics.resultCount,
      Unit: 'Count',
      Dimensions: baseDimensions,
    },

    // Search quality scores
    {
      MetricName: 'TopScore',
      Value: metrics.topScore || 0,
      Unit: 'None',
      Dimensions: baseDimensions,
    },
    {
      MetricName: 'AverageScore',
      Value: metrics.avgScore || 0,
      Unit: 'None',
      Dimensions: baseDimensions,
    },

    // Query expansion
    {
      MetricName: 'QueryExpansionCount',
      Value: metrics.queryExpansionCount,
      Unit: 'Count',
      Dimensions: baseDimensions,
    },

    // Cache hit rate (binary 0/1 for averaging)
    {
      MetricName: 'CacheHit',
      Value: metrics.cacheHit ? 1 : 0,
      Unit: 'None',
      Dimensions: baseDimensions,
    },
  ];

  // Add optional time breakdown metrics if provided
  if (metrics.embeddingTimeMs !== undefined) {
    metricData.push({
      MetricName: 'EmbeddingTime',
      Value: metrics.embeddingTimeMs,
      Unit: 'Milliseconds',
      Dimensions: baseDimensions,
    });
  }

  if (metrics.vectorSearchTimeMs !== undefined) {
    metricData.push({
      MetricName: 'VectorSearchTime',
      Value: metrics.vectorSearchTimeMs,
      Unit: 'Milliseconds',
      Dimensions: baseDimensions,
    });
  }

  if (metrics.bm25TimeMs !== undefined) {
    metricData.push({
      MetricName: 'BM25SearchTime',
      Value: metrics.bm25TimeMs,
      Unit: 'Milliseconds',
      Dimensions: baseDimensions,
    });
  }

  if (metrics.aiGenerationTimeMs !== undefined) {
    metricData.push({
      MetricName: 'AIGenerationTime',
      Value: metrics.aiGenerationTimeMs,
      Unit: 'Milliseconds',
      Dimensions: baseDimensions,
    });
  }

  try {
    await cloudwatch.send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: metricData,
      })
    );
  } catch (error) {
    // Log but don't throw - metrics should not affect search functionality
    console.error('Failed to publish CloudWatch metrics:', error);
  }
}

/**
 * Feedback metrics from user interactions
 */
export interface FeedbackMetrics {
  /** The search query */
  query: string;

  /** Position of clicked result (1-indexed) */
  resultRank: number;

  /** Type of action */
  action: 'click' | 'inquiry' | 'proposal' | 'skip';
}

/**
 * Publish user feedback metrics to CloudWatch
 *
 * @param metrics - Feedback metrics to publish
 */
export async function publishFeedbackMetrics(metrics: FeedbackMetrics): Promise<void> {
  const stage = process.env.STAGE || 'dev';
  const dimensions = [
    { Name: 'Environment', Value: stage },
    { Name: 'Action', Value: metrics.action },
  ];

  const metricData: MetricDatum[] = [
    // Click position distribution
    {
      MetricName: 'ClickPosition',
      Value: metrics.resultRank,
      Unit: 'None',
      Dimensions: dimensions,
    },

    // Conversion events
    {
      MetricName: 'ConversionEvent',
      Value: 1,
      Unit: 'Count',
      Dimensions: dimensions,
    },
  ];

  // Track if user clicked top-1 result (indicates good ranking)
  if (metrics.resultRank === 1) {
    metricData.push({
      MetricName: 'Top1Click',
      Value: 1,
      Unit: 'Count',
      Dimensions: [{ Name: 'Environment', Value: stage }],
    });
  }

  try {
    await cloudwatch.send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: metricData,
      })
    );
  } catch (error) {
    console.error('Failed to publish feedback metrics:', error);
  }
}

/**
 * Timer utility for measuring operation durations
 */
export class MetricsTimer {
  private startTimes: Map<string, number> = new Map();
  private durations: Map<string, number> = new Map();

  /**
   * Start timing an operation
   */
  start(operation: string): void {
    this.startTimes.set(operation, performance.now());
  }

  /**
   * Stop timing an operation
   * @returns Duration in milliseconds
   */
  stop(operation: string): number {
    const startTime = this.startTimes.get(operation);
    if (startTime === undefined) {
      console.warn(`Timer for "${operation}" was not started`);
      return 0;
    }

    const duration = performance.now() - startTime;
    this.durations.set(operation, duration);
    this.startTimes.delete(operation);
    return duration;
  }

  /**
   * Get all recorded durations
   */
  getDurations(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [op, duration] of this.durations) {
      result[op] = duration;
    }
    return result;
  }

  /**
   * Get a specific duration
   */
  getDuration(operation: string): number | undefined {
    return this.durations.get(operation);
  }
}
