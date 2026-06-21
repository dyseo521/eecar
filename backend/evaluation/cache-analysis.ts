#!/usr/bin/env npx tsx
/**
 * Cache Effectiveness Analysis
 *
 * Analyzes the effectiveness of query result caching and estimates cost savings.
 *
 * Usage:
 *   npm run analyze:cache
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { CacheAnalysis } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface CacheAnalysisConfig {
  outputPath: string;
  apiEndpoint: string;
  tableName: string;
  verbose: boolean;
}

const DEFAULT_CONFIG: CacheAnalysisConfig = {
  outputPath: resolve(__dirname, 'reports', `cache-analysis-${new Date().toISOString().split('T')[0]}.json`),
  apiEndpoint: process.env.API_ENDPOINT || 'http://localhost:3001',
  tableName: process.env.PARTS_TABLE_NAME || 'eecar-parts-table-local',
  verbose: false,
};

// Cost assumptions (Bedrock pricing as of 2024)
const COST_ASSUMPTIONS = {
  // Claude 3 Haiku (per 1M tokens)
  claudeHaikuInputPer1M: 0.25,
  claudeHaikuOutputPer1M: 1.25,

  // Titan Embeddings v2 (per 1M tokens)
  titanEmbedPer1M: 0.02,

  // Average tokens per search query
  avgInputTokens: 500, // Query + part context
  avgOutputTokens: 150, // Match explanations

  // Average latency savings per cache hit
  avgLatencySavedMs: 1500,
};

interface CacheItem {
  PK: string;
  query: string;
  hitCount: number;
  createdAt: string;
  TTL: number;
  expandedQueries?: string[];
}

/**
 * Fetch cache items from DynamoDB via API
 * In production, this would query DynamoDB directly
 */
async function fetchCacheItems(
  config: CacheAnalysisConfig
): Promise<CacheItem[]> {
  try {
    // Try to fetch cache data via API
    const response = await fetch(`${config.apiEndpoint}/api/admin/cache-stats`);

    if (response.ok) {
      const data = await response.json();
      return data.cacheItems || [];
    }

    // Fallback: Return simulated data for demo purposes
    console.log('⚠️  캐시 API 사용 불가, 시뮬레이션 데이터 사용\n');
    return generateSimulatedCacheData();
  } catch (error) {
    console.log('⚠️  캐시 데이터 조회 실패, 시뮬레이션 데이터 사용\n');
    return generateSimulatedCacheData();
  }
}

/**
 * Generate simulated cache data for demonstration
 */
function generateSimulatedCacheData(): CacheItem[] {
  const queries = [
    { query: '현대 배터리', hitCount: 45 },
    { query: '테슬라 모터', hitCount: 38 },
    { query: 'SOH 80% 이상 배터리', hitCount: 32 },
    { query: '800V 인버터', hitCount: 28 },
    { query: '알루미늄 6061 패널', hitCount: 22 },
    { query: '기아 EV6 부품', hitCount: 19 },
    { query: '고출력 모터', hitCount: 16 },
    { query: 'NCM 양극재 배터리', hitCount: 14 },
    { query: 'BMW i3 배터리', hitCount: 12 },
    { query: '닛산 리프 모터', hitCount: 10 },
    { query: '경량 프레임', hitCount: 8 },
    { query: '효율 95% 모터', hitCount: 7 },
    { query: '아우디 e-tron 도어', hitCount: 5 },
    { query: '폭스바겐 ID.4 인버터', hitCount: 4 },
    { query: '파노라마 선루프', hitCount: 3 },
    { query: '카본 섀시', hitCount: 3 },
    { query: '재활용 등급 배터리', hitCount: 2 },
    { query: '특수 합금 부품', hitCount: 1 },
    { query: 'LFP 배터리', hitCount: 1 },
    { query: '교체용 윈드쉴드', hitCount: 1 },
  ];

  const now = Date.now();

  return queries.map((q, i) => ({
    PK: `MATCH#${i.toString().padStart(3, '0')}`,
    query: q.query,
    hitCount: q.hitCount,
    createdAt: new Date(now - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
    TTL: Math.floor(now / 1000) + 7 * 24 * 60 * 60,
    expandedQueries: [`${q.query}`, `${q.query} 관련`, `${q.query} 유사`],
  }));
}

/**
 * Analyze cache effectiveness
 */
function analyzeCacheEffectiveness(
  cacheItems: CacheItem[]
): CacheAnalysis {
  // Calculate basic stats
  const uniqueQueries = cacheItems.length;
  const totalHits = cacheItems.reduce((sum, item) => sum + item.hitCount, 0);
  const totalQueries = totalHits + uniqueQueries; // hits + initial misses
  const hitRate = totalHits / totalQueries;

  // Calculate cost savings
  // Each cache hit saves: 1 embedding call + 1 Claude call for explanations
  const savedEmbeddingCalls = totalHits;
  const savedClaudeCalls = totalHits;

  // Cost calculation
  const embeddingCostPerCall =
    (COST_ASSUMPTIONS.avgInputTokens / 1_000_000) * COST_ASSUMPTIONS.titanEmbedPer1M;

  const claudeCostPerCall =
    (COST_ASSUMPTIONS.avgInputTokens / 1_000_000) * COST_ASSUMPTIONS.claudeHaikuInputPer1M +
    (COST_ASSUMPTIONS.avgOutputTokens / 1_000_000) * COST_ASSUMPTIONS.claudeHaikuOutputPer1M;

  const totalCostSaved =
    (savedEmbeddingCalls * embeddingCostPerCall) +
    (savedClaudeCalls * claudeCostPerCall);

  // Latency savings
  const totalLatencySaved = totalHits * COST_ASSUMPTIONS.avgLatencySavedMs;

  // Find top and low hit queries
  const sortedByHits = [...cacheItems].sort((a, b) => b.hitCount - a.hitCount);
  const topQueries = sortedByHits.slice(0, 10).map(item => ({
    query: item.query,
    hitCount: item.hitCount,
  }));

  const lowHitQueries = sortedByHits
    .filter(item => item.hitCount <= 2)
    .slice(-10)
    .map(item => ({
      query: item.query,
      hitCount: item.hitCount,
    }));

  return {
    period: '최근 7일 (TTL 기준)',
    totalQueries,
    uniqueQueries,
    cacheHits: totalHits,
    cacheMisses: uniqueQueries, // Each unique query was a miss at least once
    hitRate,
    savings: {
      bedrockCalls: savedEmbeddingCalls + savedClaudeCalls,
      estimatedCostUSD: totalCostSaved,
      latencySavedMs: totalLatencySaved,
    },
    topQueries,
    lowHitQueries,
  };
}

/**
 * Generate recommendations based on analysis
 */
function generateRecommendations(
  analysis: CacheAnalysis
): string[] {
  const recommendations: string[] = [];

  // Hit rate recommendations
  if (analysis.hitRate < 0.2) {
    recommendations.push(
      '캐시 히트율이 낮습니다. 쿼리 정규화를 통해 유사 쿼리를 통합하세요.'
    );
    recommendations.push(
      '인기 검색어 사전 캐싱(prefetch)을 고려하세요.'
    );
  } else if (analysis.hitRate >= 0.3 && analysis.hitRate < 0.5) {
    recommendations.push(
      '캐시 히트율이 양호합니다. TTL 연장을 통해 추가 개선이 가능합니다.'
    );
  } else if (analysis.hitRate >= 0.5) {
    recommendations.push(
      '우수한 캐시 히트율입니다. 현재 전략을 유지하세요.'
    );
  }

  // Low hit query recommendations
  const lowHitCount = analysis.lowHitQueries.length;
  if (lowHitCount > analysis.uniqueQueries * 0.5) {
    recommendations.push(
      `단발성 쿼리 비율이 높습니다 (${((lowHitCount / analysis.uniqueQueries) * 100).toFixed(0)}%). 캐시 TTL 단축을 고려하세요.`
    );
  }

  // Cost recommendations
  if (analysis.savings.estimatedCostUSD < 10) {
    recommendations.push(
      '현재 트래픽에서는 캐시 효과가 제한적입니다. 트래픽 증가 시 효과가 커집니다.'
    );
  } else if (analysis.savings.estimatedCostUSD >= 100) {
    recommendations.push(
      '캐시가 상당한 비용을 절감하고 있습니다. 캐시 인프라 투자를 정당화합니다.'
    );
  }

  // Popular query recommendations
  const veryPopular = analysis.topQueries.filter(q => q.hitCount >= 30);
  if (veryPopular.length > 0) {
    recommendations.push(
      `인기 쿼리 ${veryPopular.length}개를 감지했습니다. 이들의 TTL을 늘리거나 ElastiCache로 이동을 고려하세요.`
    );
  }

  return recommendations;
}

/**
 * Print analysis summary
 */
function printSummary(
  analysis: CacheAnalysis,
  recommendations: string[]
): void {
  console.log('\n' + '='.repeat(60));
  console.log('캐시 효과 분석 결과');
  console.log('='.repeat(60));

  console.log('\n📊 기본 통계:');
  console.log(`  분석 기간:        ${analysis.period}`);
  console.log(`  총 쿼리 수:       ${analysis.totalQueries}`);
  console.log(`  고유 쿼리 수:     ${analysis.uniqueQueries}`);
  console.log(`  캐시 히트:        ${analysis.cacheHits}`);
  console.log(`  캐시 미스:        ${analysis.cacheMisses}`);
  console.log(`  히트율:           ${(analysis.hitRate * 100).toFixed(1)}%`);

  console.log('\n💰 비용 절감 효과:');
  console.log(`  절감된 Bedrock 호출: ${analysis.savings.bedrockCalls}회`);
  console.log(`  예상 절감 비용:      $${analysis.savings.estimatedCostUSD.toFixed(2)}`);
  console.log(`  절감된 대기 시간:    ${(analysis.savings.latencySavedMs / 1000).toFixed(1)}초`);

  console.log('\n🔥 인기 쿼리 Top 5:');
  for (const query of analysis.topQueries.slice(0, 5)) {
    console.log(`  ${query.hitCount.toString().padStart(3)}회: "${query.query}"`);
  }

  console.log('\n❄️  저활용 쿼리 (1-2회):');
  for (const query of analysis.lowHitQueries.slice(0, 5)) {
    console.log(`  ${query.hitCount}회: "${query.query}"`);
  }

  // Visualization of hit rate
  console.log('\n📈 히트율 시각화:');
  const hitBar = '█'.repeat(Math.round(analysis.hitRate * 30));
  const missBar = '░'.repeat(30 - Math.round(analysis.hitRate * 30));
  console.log(`  [${hitBar}${missBar}] ${(analysis.hitRate * 100).toFixed(1)}%`);

  console.log('\n💡 권장사항:');
  for (const rec of recommendations) {
    console.log(`  • ${rec}`);
  }

  // Monthly projection
  console.log('\n📅 월간 예상 (현재 추세 기준):');
  const dailyQueries = analysis.totalQueries / 7;
  const monthlyQueries = dailyQueries * 30;
  const monthlySavings = (analysis.savings.estimatedCostUSD / 7) * 30;
  console.log(`  월간 예상 쿼리:     ${Math.round(monthlyQueries)}회`);
  console.log(`  월간 예상 절감:     $${monthlySavings.toFixed(2)}`);

  console.log('\n' + '='.repeat(60));
}

/**
 * Main analysis function
 */
async function runCacheAnalysis(): Promise<void> {
  console.log('=== 캐시 효과 분석 시작 ===\n');

  const config = DEFAULT_CONFIG;

  if (process.argv.includes('--verbose') || process.argv.includes('-v')) {
    config.verbose = true;
  }

  // Fetch cache data
  console.log('📥 캐시 데이터 조회 중...');
  const cacheItems = await fetchCacheItems(config);
  console.log(`   ${cacheItems.length}개 캐시 항목 로드 완료\n`);

  // Analyze
  console.log('📊 분석 중...');
  const analysis = analyzeCacheEffectiveness(cacheItems);
  const recommendations = generateRecommendations(analysis);

  // Ensure output directory exists
  const outputDir = dirname(config.outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    config,
    analysis,
    recommendations,
    costAssumptions: COST_ASSUMPTIONS,
  };

  writeFileSync(config.outputPath, JSON.stringify(report, null, 2));
  console.log(`💾 결과 저장: ${config.outputPath}`);

  // Print summary
  printSummary(analysis, recommendations);
}

// Run if executed directly
runCacheAnalysis().catch(error => {
  console.error('Cache analysis failed:', error);
  process.exit(1);
});
