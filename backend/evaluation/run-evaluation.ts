#!/usr/bin/env npx tsx
/**
 * EECAR RAG Evaluation Runner
 *
 * Runs offline evaluation against the golden dataset and generates reports.
 *
 * Usage:
 *   npm run eval:rag                    # Run with defaults
 *   npm run eval:rag -- --endpoint URL  # Custom API endpoint
 *   npm run eval:rag -- --verbose       # Verbose output
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  precisionAtK,
  recallAtK,
  ndcgAtK,
  mrr,
  f1Score,
  average,
  percentile,
  standardDeviation,
} from './metrics.js';
import type {
  GoldenDataset,
  GoldenQuery,
  EvaluationConfig,
  EvaluationReport,
  QueryResult,
  OverallMetrics,
  GroupMetrics,
} from './types.js';

// Get directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default configuration
const DEFAULT_CONFIG: EvaluationConfig = {
  goldenDatasetPath: resolve(__dirname, 'golden-dataset.json'),
  outputPath: resolve(__dirname, 'reports', `evaluation-${new Date().toISOString().split('T')[0]}.json`),
  kValues: [1, 3, 5, 10],
  apiEndpoint: process.env.API_ENDPOINT || 'http://localhost:3001',
  verbose: false,
};

/**
 * Parse command line arguments
 */
function parseArgs(): Partial<EvaluationConfig> {
  const args: Partial<EvaluationConfig> = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--endpoint':
        args.apiEndpoint = argv[++i];
        break;
      case '--output':
        args.outputPath = argv[++i];
        break;
      case '--dataset':
        args.goldenDatasetPath = argv[++i];
        break;
      case '--verbose':
      case '-v':
        args.verbose = true;
        break;
      case '--help':
      case '-h':
        console.log(`
EECAR RAG Evaluation Runner

Usage:
  npm run eval:rag [options]

Options:
  --endpoint URL    API endpoint to test (default: http://localhost:3001)
  --output FILE     Output report path
  --dataset FILE    Golden dataset JSON path
  --verbose, -v     Enable verbose output
  --help, -h        Show this help

Example:
  npm run eval:rag -- --endpoint http://localhost:3001 --verbose
        `);
        process.exit(0);
    }
  }

  return args;
}

/**
 * Call the search API
 */
async function callSearchAPI(
  endpoint: string,
  query: string,
  filters?: { category?: string },
  topK: number = 10
): Promise<{
  results: Array<{ partId: string; score: number }>;
  expandedQueries?: string[];
  cached: boolean;
}> {
  try {
    const response = await fetch(`${endpoint}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, filters, topK }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Failed to call search API for query "${query}":`, error);
    return { results: [], cached: false };
  }
}

/**
 * Evaluate a single query
 */
async function evaluateQuery(
  goldenQuery: GoldenQuery,
  config: EvaluationConfig
): Promise<QueryResult> {
  const startTime = performance.now();

  // Call search API
  const searchResponse = await callSearchAPI(
    config.apiEndpoint,
    goldenQuery.query,
    goldenQuery.category ? { category: goldenQuery.category } : undefined,
    Math.max(...config.kValues)
  );

  const latencyMs = performance.now() - startTime;

  // Extract retrieved IDs
  const retrievedIds = searchResponse.results.map(r => r.partId);

  // Build ground truth sets
  const relevantIds = new Set(
    goldenQuery.expectedRelevantParts.map(p => p.partId)
  );

  const relevanceScores = new Map(
    goldenQuery.expectedRelevantParts.map(p => [p.partId, p.relevanceScore])
  );

  // Calculate metrics
  const metrics: Record<string, number> = {
    latencyMs,
    mrr: mrr(retrievedIds, relevantIds),
  };

  for (const k of config.kValues) {
    const p = precisionAtK(retrievedIds, relevantIds, k);
    const r = recallAtK(retrievedIds, relevantIds, k);

    metrics[`precision@${k}`] = p;
    metrics[`recall@${k}`] = r;
    metrics[`f1@${k}`] = f1Score(p, r);
    metrics[`ndcg@${k}`] = ndcgAtK(retrievedIds, relevanceScores, k);
  }

  return {
    queryId: goldenQuery.id,
    query: goldenQuery.query,
    difficulty: goldenQuery.difficulty,
    queryType: goldenQuery.queryType,
    latencyMs,
    cached: searchResponse.cached,
    metrics,
    retrievedIds,
    expandedQueries: searchResponse.expandedQueries,
  };
}

/**
 * Aggregate results by a grouping key
 */
function groupAndAggregate(
  results: QueryResult[],
  groupKey: 'difficulty' | 'queryType'
): Record<string, GroupMetrics> {
  const groups = new Map<string, QueryResult[]>();

  for (const result of results) {
    const key = result[groupKey];
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(result);
  }

  const aggregated: Record<string, GroupMetrics> = {};

  for (const [key, groupResults] of groups) {
    aggregated[key] = {
      count: groupResults.length,
      avgPrecision5: average(groupResults.map(r => r.metrics['precision@5'] || 0)),
      avgRecall10: average(groupResults.map(r => r.metrics['recall@10'] || 0)),
      avgMRR: average(groupResults.map(r => r.metrics.mrr || 0)),
      avgLatencyMs: average(groupResults.map(r => r.latencyMs)),
    };
  }

  return aggregated;
}

/**
 * Generate the evaluation report
 */
function aggregateResults(
  results: QueryResult[],
  config: EvaluationConfig
): EvaluationReport {
  // Overall metrics
  const overall: OverallMetrics = {
    avgPrecision: {},
    avgRecall: {},
    avgNDCG: {},
    avgMRR: average(results.map(r => r.metrics.mrr || 0)),
    avgLatencyMs: average(results.map(r => r.latencyMs)),
    cacheHitRate: results.filter(r => r.cached).length / results.length,
  };

  for (const k of config.kValues) {
    overall.avgPrecision[`@${k}`] = average(
      results.map(r => r.metrics[`precision@${k}`] || 0)
    );
    overall.avgRecall[`@${k}`] = average(
      results.map(r => r.metrics[`recall@${k}`] || 0)
    );
    overall.avgNDCG[`@${k}`] = average(
      results.map(r => r.metrics[`ndcg@${k}`] || 0)
    );
  }

  // Group by difficulty and query type
  const byDifficulty = groupAndAggregate(results, 'difficulty');
  const byQueryType = groupAndAggregate(results, 'queryType');

  // Find queries that need improvement (bottom 20% by MRR)
  const sortedByMRR = [...results].sort((a, b) => a.metrics.mrr - b.metrics.mrr);
  const needsImprovement = sortedByMRR.slice(0, Math.ceil(results.length * 0.2));

  return {
    timestamp: new Date().toISOString(),
    config,
    overall,
    byDifficulty,
    byQueryType,
    queryResults: results,
    needsImprovement,
  };
}

/**
 * Print evaluation summary to console
 */
function printSummary(report: EvaluationReport): void {
  console.log('\n' + '='.repeat(60));
  console.log('EECAR RAG 평가 결과 요약');
  console.log('='.repeat(60));

  console.log('\n📊 전체 평균 메트릭:');
  console.log(`  MRR:           ${(report.overall.avgMRR * 100).toFixed(1)}%`);
  console.log(`  Precision@5:   ${(report.overall.avgPrecision['@5'] * 100).toFixed(1)}%`);
  console.log(`  Recall@10:     ${(report.overall.avgRecall['@10'] * 100).toFixed(1)}%`);
  console.log(`  NDCG@10:       ${(report.overall.avgNDCG['@10'] * 100).toFixed(1)}%`);
  console.log(`  평균 Latency:  ${report.overall.avgLatencyMs.toFixed(0)}ms`);
  console.log(`  캐시 히트율:   ${(report.overall.cacheHitRate * 100).toFixed(1)}%`);

  console.log('\n📈 난이도별 성능:');
  for (const [difficulty, metrics] of Object.entries(report.byDifficulty)) {
    console.log(`  ${difficulty.padEnd(8)} | P@5: ${(metrics.avgPrecision5 * 100).toFixed(1)}% | R@10: ${(metrics.avgRecall10 * 100).toFixed(1)}% | MRR: ${(metrics.avgMRR * 100).toFixed(1)}%`);
  }

  console.log('\n📋 쿼리 유형별 성능:');
  for (const [queryType, metrics] of Object.entries(report.byQueryType)) {
    console.log(`  ${queryType.padEnd(8)} | P@5: ${(metrics.avgPrecision5 * 100).toFixed(1)}% | R@10: ${(metrics.avgRecall10 * 100).toFixed(1)}% | MRR: ${(metrics.avgMRR * 100).toFixed(1)}%`);
  }

  if (report.needsImprovement.length > 0) {
    console.log('\n⚠️  개선 필요 쿼리 (하위 20%):');
    for (const query of report.needsImprovement.slice(0, 5)) {
      console.log(`  - [${query.queryId}] "${query.query}" (MRR: ${(query.metrics.mrr * 100).toFixed(1)}%)`);
    }
  }

  // Performance summary with targets
  console.log('\n🎯 목표 대비 성과:');
  const targets = {
    'Precision@5': { current: report.overall.avgPrecision['@5'], target: 0.75 },
    'Recall@10': { current: report.overall.avgRecall['@10'], target: 0.70 },
    'NDCG@10': { current: report.overall.avgNDCG['@10'], target: 0.80 },
    'MRR': { current: report.overall.avgMRR, target: 0.85 },
  };

  for (const [name, { current, target }] of Object.entries(targets)) {
    const status = current >= target ? '✅' : '❌';
    const gap = ((current - target) * 100).toFixed(1);
    console.log(`  ${status} ${name}: ${(current * 100).toFixed(1)}% (목표: ${(target * 100).toFixed(1)}%, 차이: ${gap}%)`);
  }

  console.log('\n' + '='.repeat(60));
}

/**
 * Main evaluation function
 */
async function runEvaluation(): Promise<void> {
  console.log('=== EECAR RAG 평가 시작 ===\n');

  // Parse config
  const args = parseArgs();
  const config: EvaluationConfig = { ...DEFAULT_CONFIG, ...args };

  // Load golden dataset
  console.log(`📁 Golden Dataset 로드: ${config.goldenDatasetPath}`);
  const datasetContent = readFileSync(config.goldenDatasetPath, 'utf-8');
  const dataset: GoldenDataset = JSON.parse(datasetContent);

  console.log(`   총 ${dataset.queries.length}개 쿼리 평가 예정`);
  console.log(`   API 엔드포인트: ${config.apiEndpoint}\n`);

  // Run evaluations
  const results: QueryResult[] = [];

  for (const goldenQuery of dataset.queries) {
    if (config.verbose) {
      process.stdout.write(`[${goldenQuery.id}] "${goldenQuery.query}" ... `);
    }

    const result = await evaluateQuery(goldenQuery, config);
    results.push(result);

    if (config.verbose) {
      console.log(`P@5: ${(result.metrics['precision@5'] * 100).toFixed(0)}%, MRR: ${(result.metrics.mrr * 100).toFixed(0)}%`);
    } else {
      process.stdout.write('.');
    }
  }

  if (!config.verbose) {
    console.log(' Done!');
  }

  // Generate report
  console.log('\n📊 보고서 생성 중...');
  const report = aggregateResults(results, config);

  // Ensure output directory exists
  const outputDir = dirname(config.outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Save report
  writeFileSync(config.outputPath, JSON.stringify(report, null, 2));
  console.log(`💾 결과 저장: ${config.outputPath}`);

  // Print summary
  printSummary(report);
}

// Run if executed directly
runEvaluation().catch(error => {
  console.error('Evaluation failed:', error);
  process.exit(1);
});
