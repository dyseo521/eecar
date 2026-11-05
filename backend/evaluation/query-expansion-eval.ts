#!/usr/bin/env npx tsx
/**
 * Query Expansion Effect Evaluation
 *
 * Measures the impact of query expansion on search quality by comparing
 * original query results vs expanded query results.
 *
 * Usage:
 *   npm run eval:query-expansion
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { precisionAtK, recallAtK } from './metrics.js';
import type { GoldenDataset, GoldenQuery, QueryExpansionMetrics } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ExpansionEvalConfig {
  goldenDatasetPath: string;
  outputPath: string;
  apiEndpoint: string;
  verbose: boolean;
}

const DEFAULT_CONFIG: ExpansionEvalConfig = {
  goldenDatasetPath: resolve(__dirname, 'golden-dataset.json'),
  outputPath: resolve(__dirname, 'reports', `query-expansion-${new Date().toISOString().split('T')[0]}.json`),
  apiEndpoint: process.env.API_ENDPOINT || 'http://localhost:3001',
  verbose: false,
};

/**
 * Call search API with query expansion disabled
 */
async function searchWithoutExpansion(
  endpoint: string,
  query: string,
  topK: number = 10
): Promise<{
  results: Array<{ partId: string; score: number }>;
  latencyMs: number;
}> {
  const startTime = performance.now();

  try {
    const response = await fetch(`${endpoint}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        topK,
        options: { expandQuery: false }, // Disable expansion
      }),
    });

    const data = await response.json();
    const latencyMs = performance.now() - startTime;

    return {
      results: data.results || [],
      latencyMs,
    };
  } catch (error) {
    return { results: [], latencyMs: performance.now() - startTime };
  }
}

/**
 * Call search API with query expansion enabled
 */
async function searchWithExpansion(
  endpoint: string,
  query: string,
  topK: number = 10
): Promise<{
  results: Array<{ partId: string; score: number }>;
  expandedQueries: string[];
  latencyMs: number;
}> {
  const startTime = performance.now();

  try {
    const response = await fetch(`${endpoint}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        topK,
        options: { expandQuery: true }, // Enable expansion
      }),
    });

    const data = await response.json();
    const latencyMs = performance.now() - startTime;

    return {
      results: data.results || [],
      expandedQueries: data.expandedQueries || [query],
      latencyMs,
    };
  } catch (error) {
    return { results: [], expandedQueries: [query], latencyMs: performance.now() - startTime };
  }
}

/**
 * Evaluate query expansion effect for a single query
 */
async function evaluateQueryExpansion(
  goldenQuery: GoldenQuery,
  config: ExpansionEvalConfig
): Promise<QueryExpansionMetrics> {
  const query = goldenQuery.query;
  const relevantIds = new Set(goldenQuery.expectedRelevantParts.map(p => p.partId));

  // Search without expansion
  const originalResult = await searchWithoutExpansion(config.apiEndpoint, query);
  const originalIds = originalResult.results.map(r => r.partId);

  // Search with expansion
  const expandedResult = await searchWithExpansion(config.apiEndpoint, query);
  const expandedIds = expandedResult.results.map(r => r.partId);

  // Calculate metrics
  const originalP5 = precisionAtK(originalIds, relevantIds, 5);
  const originalR10 = recallAtK(originalIds, relevantIds, 10);
  const expandedP5 = precisionAtK(expandedIds, relevantIds, 5);
  const expandedR10 = recallAtK(expandedIds, relevantIds, 10);

  // Calculate improvement
  const recallImprovement = originalR10 > 0
    ? (expandedR10 - originalR10) / originalR10
    : expandedR10 > 0 ? 1 : 0;

  const precisionChange = expandedP5 - originalP5;

  // Find newly found and lost parts
  const originalIdSet = new Set(originalIds);
  const expandedIdSet = new Set(expandedIds);

  const newlyFoundParts = expandedIds.filter(id => !originalIdSet.has(id));
  const lostParts = originalIds.filter(id => !expandedIdSet.has(id));

  // Determine if expansion was worth it
  // Worth it if recall improved by 10%+ and precision didn't drop by more than 5%
  const worthIt = recallImprovement >= 0.1 && precisionChange >= -0.05;

  return {
    query,
    original: {
      resultIds: originalIds,
      precision5: originalP5,
      recall10: originalR10,
      latencyMs: originalResult.latencyMs,
    },
    expanded: {
      expandedQueries: expandedResult.expandedQueries,
      resultIds: expandedIds,
      precision5: expandedP5,
      recall10: expandedR10,
      latencyMs: expandedResult.latencyMs,
    },
    comparison: {
      recallImprovement,
      precisionChange,
      newlyFoundParts,
      lostParts,
      additionalLatencyMs: expandedResult.latencyMs - originalResult.latencyMs,
      worthIt,
    },
  };
}

/**
 * Aggregate expansion evaluation results
 */
interface ExpansionReport {
  timestamp: string;
  config: ExpansionEvalConfig;
  summary: {
    totalQueries: number;
    worthItCount: number;
    worthItRate: number;
    avgRecallImprovement: number;
    avgPrecisionChange: number;
    avgAdditionalLatencyMs: number;
    avgNewlyFoundParts: number;
    avgLostParts: number;
  };
  queryResults: QueryExpansionMetrics[];
  bestImprovements: QueryExpansionMetrics[];
  worstImpacts: QueryExpansionMetrics[];
}

function aggregateExpansionResults(
  results: QueryExpansionMetrics[],
  config: ExpansionEvalConfig
): ExpansionReport {
  const worthItCount = results.filter(r => r.comparison.worthIt).length;

  const summary = {
    totalQueries: results.length,
    worthItCount,
    worthItRate: worthItCount / results.length,
    avgRecallImprovement: average(results.map(r => r.comparison.recallImprovement)),
    avgPrecisionChange: average(results.map(r => r.comparison.precisionChange)),
    avgAdditionalLatencyMs: average(results.map(r => r.comparison.additionalLatencyMs)),
    avgNewlyFoundParts: average(results.map(r => r.comparison.newlyFoundParts.length)),
    avgLostParts: average(results.map(r => r.comparison.lostParts.length)),
  };

  // Find best and worst cases
  const sortedByRecall = [...results].sort(
    (a, b) => b.comparison.recallImprovement - a.comparison.recallImprovement
  );

  const bestImprovements = sortedByRecall.slice(0, 5);
  const worstImpacts = sortedByRecall.slice(-5).reverse();

  return {
    timestamp: new Date().toISOString(),
    config,
    summary,
    queryResults: results,
    bestImprovements,
    worstImpacts,
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Print expansion evaluation summary
 */
function printExpansionSummary(report: ExpansionReport): void {
  console.log('\n' + '='.repeat(60));
  console.log('쿼리 확장 효과 분석 결과');
  console.log('='.repeat(60));

  console.log('\n📊 전체 요약:');
  console.log(`  총 쿼리 수:       ${report.summary.totalQueries}`);
  console.log(`  효과적인 쿼리:    ${report.summary.worthItCount} (${(report.summary.worthItRate * 100).toFixed(1)}%)`);
  console.log(`  평균 Recall 향상: ${(report.summary.avgRecallImprovement * 100).toFixed(1)}%`);
  console.log(`  평균 Precision 변화: ${(report.summary.avgPrecisionChange * 100).toFixed(1)}%`);
  console.log(`  추가 Latency:     ${report.summary.avgAdditionalLatencyMs.toFixed(0)}ms`);
  console.log(`  평균 새로 찾은 부품: ${report.summary.avgNewlyFoundParts.toFixed(1)}개`);
  console.log(`  평균 놓친 부품:   ${report.summary.avgLostParts.toFixed(1)}개`);

  console.log('\n✅ 가장 큰 개선 (Top 5):');
  for (const result of report.bestImprovements) {
    console.log(`  "${result.query.slice(0, 30)}..."`);
    console.log(`    Recall: ${(result.original.recall10 * 100).toFixed(0)}% → ${(result.expanded.recall10 * 100).toFixed(0)}% (+${(result.comparison.recallImprovement * 100).toFixed(0)}%)`);
  }

  console.log('\n❌ 가장 큰 저하 (Bottom 5):');
  for (const result of report.worstImpacts) {
    if (result.comparison.recallImprovement < 0) {
      console.log(`  "${result.query.slice(0, 30)}..."`);
      console.log(`    Recall: ${(result.original.recall10 * 100).toFixed(0)}% → ${(result.expanded.recall10 * 100).toFixed(0)}% (${(result.comparison.recallImprovement * 100).toFixed(0)}%)`);
    }
  }

  // Recommendation
  console.log('\n💡 권장사항:');
  if (report.summary.worthItRate >= 0.6) {
    console.log('  쿼리 확장을 기본적으로 활성화하는 것을 권장합니다.');
    console.log(`  ${(report.summary.worthItRate * 100).toFixed(0)}%의 쿼리에서 효과적입니다.`);
  } else if (report.summary.worthItRate >= 0.4) {
    console.log('  쿼리 유형에 따라 선택적으로 활성화하는 것을 권장합니다.');
  } else {
    console.log('  쿼리 확장의 효과가 제한적입니다. 최적화가 필요합니다.');
  }

  console.log('\n' + '='.repeat(60));
}

/**
 * Main evaluation function
 */
async function runExpansionEvaluation(): Promise<void> {
  console.log('=== 쿼리 확장 효과 평가 시작 ===\n');

  const config = DEFAULT_CONFIG;

  // Check for verbose flag
  if (process.argv.includes('--verbose') || process.argv.includes('-v')) {
    config.verbose = true;
  }

  // Load golden dataset
  console.log(`📁 Golden Dataset 로드: ${config.goldenDatasetPath}`);
  const datasetContent = readFileSync(config.goldenDatasetPath, 'utf-8');
  const dataset: GoldenDataset = JSON.parse(datasetContent);

  console.log(`   총 ${dataset.queries.length}개 쿼리 평가 예정\n`);

  // Run evaluations
  const results: QueryExpansionMetrics[] = [];

  for (const goldenQuery of dataset.queries) {
    if (config.verbose) {
      process.stdout.write(`[${goldenQuery.id}] "${goldenQuery.query}" ... `);
    }

    const result = await evaluateQueryExpansion(goldenQuery, config);
    results.push(result);

    if (config.verbose) {
      const emoji = result.comparison.worthIt ? '✅' : '❌';
      console.log(`${emoji} Recall +${(result.comparison.recallImprovement * 100).toFixed(0)}%, P ${(result.comparison.precisionChange * 100).toFixed(0)}%`);
    } else {
      process.stdout.write('.');
    }
  }

  if (!config.verbose) {
    console.log(' Done!');
  }

  // Generate report
  console.log('\n📊 보고서 생성 중...');
  const report = aggregateExpansionResults(results, config);

  // Ensure output directory exists
  const outputDir = dirname(config.outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Save report
  writeFileSync(config.outputPath, JSON.stringify(report, null, 2));
  console.log(`💾 결과 저장: ${config.outputPath}`);

  // Print summary
  printExpansionSummary(report);
}

// Run if executed directly
runExpansionEvaluation().catch(error => {
  console.error('Expansion evaluation failed:', error);
  process.exit(1);
});
