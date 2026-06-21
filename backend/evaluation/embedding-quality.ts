#!/usr/bin/env npx tsx
/**
 * Embedding Quality Evaluation
 *
 * Analyzes the quality of part embeddings through clustering analysis.
 * Measures how well embeddings separate different categories.
 *
 * Usage:
 *   npm run eval:embedding
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { cosineSimilarity, average } from './metrics.js';
import type { ClusteringMetrics, VisualizationPoint } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface EmbeddingEvalConfig {
  outputPath: string;
  visualizationPath: string;
  apiEndpoint: string;
  vectorsBucket: string;
  verbose: boolean;
}

const DEFAULT_CONFIG: EmbeddingEvalConfig = {
  outputPath: resolve(__dirname, 'reports', `embedding-quality-${new Date().toISOString().split('T')[0]}.json`),
  visualizationPath: resolve(__dirname, 'reports', `embedding-visualization-${new Date().toISOString().split('T')[0]}.json`),
  apiEndpoint: process.env.API_ENDPOINT || 'http://localhost:3001',
  vectorsBucket: process.env.VECTORS_BUCKET || 'eecar-vectors',
  verbose: false,
};

interface PartWithEmbedding {
  partId: string;
  name: string;
  category: string;
  manufacturer: string;
  embedding: number[];
}

/**
 * Fetch all parts with their embeddings
 * Note: In production, this would fetch from S3/DynamoDB
 * For evaluation purposes, we simulate this with API calls
 */
async function fetchPartsWithEmbeddings(
  config: EmbeddingEvalConfig
): Promise<PartWithEmbedding[]> {
  try {
    // Fetch parts list
    const response = await fetch(`${config.apiEndpoint}/api/parts`);
    const data = await response.json();
    const parts = data.parts || data.items || [];

    // In production, fetch embeddings from S3
    // For now, generate mock embeddings or fetch from API
    const partsWithEmbeddings: PartWithEmbedding[] = [];

    for (const part of parts) {
      // Try to fetch embedding for each part
      try {
        const embResponse = await fetch(
          `${config.apiEndpoint}/api/parts/${part.id || part.partId}/embedding`
        );

        if (embResponse.ok) {
          const embData = await embResponse.json();
          partsWithEmbeddings.push({
            partId: part.id || part.partId,
            name: part.name,
            category: normalizeCategory(part.category),
            manufacturer: part.manufacturer,
            embedding: embData.embedding,
          });
        }
      } catch (e) {
        // Skip parts without embeddings
        if (config.verbose) {
          console.log(`  Skipping ${part.id} - no embedding available`);
        }
      }
    }

    return partsWithEmbeddings;
  } catch (error) {
    console.error('Failed to fetch parts:', error);
    return [];
  }
}

/**
 * Normalize category names to base categories
 */
function normalizeCategory(category: string): string {
  if (!category) return 'other';

  const normalized = category.toLowerCase();

  if (normalized.includes('battery') || normalized.includes('배터리')) {
    return 'battery';
  }
  if (normalized.includes('motor') || normalized.includes('모터')) {
    return 'motor';
  }
  if (normalized.includes('inverter') || normalized.includes('인버터')) {
    return 'inverter';
  }
  if (normalized.includes('body') || normalized.includes('차체') ||
      normalized.includes('chassis') || normalized.includes('panel') ||
      normalized.includes('door') || normalized.includes('window')) {
    return 'body';
  }

  return 'other';
}

/**
 * Calculate intra-category similarity (cohesion)
 */
function calculateIntraCategorySimilarity(
  parts: PartWithEmbedding[]
): Map<string, number> {
  const categoryGroups = new Map<string, PartWithEmbedding[]>();

  // Group by category
  for (const part of parts) {
    if (!categoryGroups.has(part.category)) {
      categoryGroups.set(part.category, []);
    }
    categoryGroups.get(part.category)!.push(part);
  }

  const intraSimilarity = new Map<string, number>();

  for (const [category, categoryParts] of categoryGroups) {
    if (categoryParts.length < 2) {
      intraSimilarity.set(category, 1.0); // Perfect similarity for single item
      continue;
    }

    let sum = 0;
    let count = 0;

    for (let i = 0; i < categoryParts.length; i++) {
      for (let j = i + 1; j < categoryParts.length; j++) {
        sum += cosineSimilarity(
          categoryParts[i].embedding,
          categoryParts[j].embedding
        );
        count++;
      }
    }

    intraSimilarity.set(category, count > 0 ? sum / count : 0);
  }

  return intraSimilarity;
}

/**
 * Calculate inter-category similarity (separation)
 * Lower is better - categories should be well separated
 */
function calculateInterCategorySimilarity(
  parts: PartWithEmbedding[]
): number {
  const categoryGroups = new Map<string, PartWithEmbedding[]>();

  for (const part of parts) {
    if (!categoryGroups.has(part.category)) {
      categoryGroups.set(part.category, []);
    }
    categoryGroups.get(part.category)!.push(part);
  }

  const categories = Array.from(categoryGroups.keys());

  if (categories.length < 2) return 0;

  let sum = 0;
  let count = 0;

  for (let i = 0; i < categories.length; i++) {
    for (let j = i + 1; j < categories.length; j++) {
      const group1 = categoryGroups.get(categories[i])!;
      const group2 = categoryGroups.get(categories[j])!;

      for (const part1 of group1) {
        for (const part2 of group2) {
          sum += cosineSimilarity(part1.embedding, part2.embedding);
          count++;
        }
      }
    }
  }

  return count > 0 ? sum / count : 0;
}

/**
 * Calculate Silhouette Score for clustering quality
 * Range: -1 to 1, higher is better
 */
function calculateSilhouetteScore(
  parts: PartWithEmbedding[]
): number {
  const categoryGroups = new Map<string, PartWithEmbedding[]>();

  for (const part of parts) {
    if (!categoryGroups.has(part.category)) {
      categoryGroups.set(part.category, []);
    }
    categoryGroups.get(part.category)!.push(part);
  }

  if (categoryGroups.size < 2) return 0;

  let totalSilhouette = 0;
  let totalPoints = 0;

  for (const [category, categoryParts] of categoryGroups) {
    for (const part of categoryParts) {
      // Calculate a(i) = average distance to same cluster points
      let intraSum = 0;
      let intraCount = 0;

      for (const other of categoryParts) {
        if (other.partId !== part.partId) {
          intraSum += 1 - cosineSimilarity(part.embedding, other.embedding);
          intraCount++;
        }
      }

      const a = intraCount > 0 ? intraSum / intraCount : 0;

      // Calculate b(i) = minimum average distance to other clusters
      let minInterAvg = Infinity;

      for (const [otherCategory, otherParts] of categoryGroups) {
        if (otherCategory === category) continue;

        let interSum = 0;
        for (const other of otherParts) {
          interSum += 1 - cosineSimilarity(part.embedding, other.embedding);
        }

        const interAvg = interSum / otherParts.length;
        if (interAvg < minInterAvg) {
          minInterAvg = interAvg;
        }
      }

      const b = minInterAvg === Infinity ? 0 : minInterAvg;

      // Silhouette for this point
      const s = Math.max(a, b) === 0 ? 0 : (b - a) / Math.max(a, b);
      totalSilhouette += s;
      totalPoints++;
    }
  }

  return totalPoints > 0 ? totalSilhouette / totalPoints : 0;
}

/**
 * Calculate KNN classification accuracy (Leave-One-Out)
 */
function calculateKNNAccuracy(
  parts: PartWithEmbedding[],
  k: number = 3
): number {
  if (parts.length < k + 1) return 0;

  let correct = 0;

  for (const testPart of parts) {
    // Find k nearest neighbors (excluding self)
    const similarities = parts
      .filter(p => p.partId !== testPart.partId)
      .map(p => ({
        part: p,
        similarity: cosineSimilarity(testPart.embedding, p.embedding),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k);

    // Majority vote
    const categoryVotes = new Map<string, number>();
    for (const { part } of similarities) {
      const count = categoryVotes.get(part.category) || 0;
      categoryVotes.set(part.category, count + 1);
    }

    let predictedCategory = '';
    let maxVotes = 0;
    for (const [category, votes] of categoryVotes) {
      if (votes > maxVotes) {
        maxVotes = votes;
        predictedCategory = category;
      }
    }

    if (predictedCategory === testPart.category) {
      correct++;
    }
  }

  return correct / parts.length;
}

/**
 * Simple PCA for 2D visualization
 * Implements power iteration method for first 2 principal components
 */
function pcaReduce(
  embeddings: number[][],
  nComponents: number = 2
): number[][] {
  const n = embeddings.length;
  const d = embeddings[0].length;

  // Center the data
  const means = new Array(d).fill(0);
  for (const emb of embeddings) {
    for (let i = 0; i < d; i++) {
      means[i] += emb[i];
    }
  }
  for (let i = 0; i < d; i++) {
    means[i] /= n;
  }

  const centered = embeddings.map(emb =>
    emb.map((v, i) => v - means[i])
  );

  // Use SVD approximation via power iteration
  const components: number[][] = [];

  for (let comp = 0; comp < nComponents; comp++) {
    // Random initial vector
    let v = new Array(d).fill(0).map(() => Math.random() - 0.5);
    let vNorm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    v = v.map(x => x / vNorm);

    // Power iteration
    for (let iter = 0; iter < 100; iter++) {
      // X^T X v
      const xv = centered.map(row =>
        row.reduce((sum, val, i) => sum + val * v[i], 0)
      );

      const xtxv = new Array(d).fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < d; j++) {
          xtxv[j] += centered[i][j] * xv[i];
        }
      }

      // Deflate previous components
      for (const prevComp of components) {
        const dot = xtxv.reduce((sum, val, i) => sum + val * prevComp[i], 0);
        for (let i = 0; i < d; i++) {
          xtxv[i] -= dot * prevComp[i];
        }
      }

      // Normalize
      vNorm = Math.sqrt(xtxv.reduce((s, x) => s + x * x, 0));
      v = xtxv.map(x => x / vNorm);
    }

    components.push(v);
  }

  // Project data onto components
  return centered.map(row =>
    components.map(comp =>
      row.reduce((sum, val, i) => sum + val * comp[i], 0)
    )
  );
}

/**
 * Generate visualization data
 */
function generateVisualization(
  parts: PartWithEmbedding[]
): VisualizationPoint[] {
  const embeddings = parts.map(p => p.embedding);
  const reduced = pcaReduce(embeddings, 2);

  return parts.map((part, i) => ({
    partId: part.partId,
    name: part.name,
    category: part.category,
    manufacturer: part.manufacturer,
    x: reduced[i][0],
    y: reduced[i][1],
  }));
}

interface EmbeddingReport {
  timestamp: string;
  config: EmbeddingEvalConfig;
  metrics: {
    intraCategorySimilarity: Record<string, number>;
    interCategorySimilarity: number;
    silhouetteScore: number;
    knnAccuracy: number;
    totalParts: number;
    categoryCounts: Record<string, number>;
  };
  interpretation: {
    cohesion: string;
    separation: string;
    overall: string;
    recommendations: string[];
  };
}

/**
 * Generate interpretation of metrics
 */
function interpretMetrics(
  intraSimilarity: Map<string, number>,
  interSimilarity: number,
  silhouetteScore: number,
  knnAccuracy: number
): {
  cohesion: string;
  separation: string;
  overall: string;
  recommendations: string[];
} {
  const avgIntra = average(Array.from(intraSimilarity.values()));

  const cohesion = avgIntra >= 0.8
    ? '우수 - 같은 카테고리 부품들이 잘 그룹화됨'
    : avgIntra >= 0.6
    ? '양호 - 대체로 잘 그룹화됨'
    : '개선 필요 - 카테고리 내 응집도가 낮음';

  const separation = interSimilarity <= 0.4
    ? '우수 - 다른 카테고리 간 잘 분리됨'
    : interSimilarity <= 0.6
    ? '양호 - 대체로 분리됨'
    : '개선 필요 - 카테고리 간 구분이 명확하지 않음';

  let overall: string;
  if (silhouetteScore >= 0.6) {
    overall = '우수 - 임베딩 품질이 높음, 검색 품질에 긍정적';
  } else if (silhouetteScore >= 0.4) {
    overall = '양호 - 임베딩이 적절히 작동함';
  } else if (silhouetteScore >= 0.2) {
    overall = '보통 - 일부 개선이 필요함';
  } else {
    overall = '개선 필요 - 임베딩 전략 재검토 필요';
  }

  const recommendations: string[] = [];

  if (avgIntra < 0.7) {
    recommendations.push(
      '카테고리별 특성을 반영한 설명 텍스트 추가 권장'
    );
  }

  if (interSimilarity > 0.5) {
    recommendations.push(
      '카테고리 구분을 위한 명시적 키워드 추가 고려'
    );
  }

  if (knnAccuracy < 0.9) {
    recommendations.push(
      '유사 부품 분류를 위한 임베딩 세부 조정 권장'
    );
  }

  if (silhouetteScore < 0.5) {
    recommendations.push(
      '하이브리드 검색(BM25 + Vector)에서 BM25 가중치 증가 고려'
    );
  }

  return { cohesion, separation, overall, recommendations };
}

/**
 * Print evaluation summary
 */
function printSummary(report: EmbeddingReport): void {
  console.log('\n' + '='.repeat(60));
  console.log('임베딩 품질 평가 결과');
  console.log('='.repeat(60));

  console.log('\n📊 평가 메트릭:');
  console.log(`  총 부품 수:       ${report.metrics.totalParts}`);
  console.log(`  Silhouette Score: ${report.metrics.silhouetteScore.toFixed(3)} (-1 ~ 1, 높을수록 좋음)`);
  console.log(`  KNN 분류 정확도:  ${(report.metrics.knnAccuracy * 100).toFixed(1)}%`);
  console.log(`  카테고리 간 유사도: ${report.metrics.interCategorySimilarity.toFixed(3)} (낮을수록 좋음)`);

  console.log('\n📈 카테고리별 내부 유사도 (높을수록 좋음):');
  for (const [category, similarity] of Object.entries(report.metrics.intraCategorySimilarity)) {
    const bar = '█'.repeat(Math.round(similarity * 20));
    console.log(`  ${category.padEnd(10)} ${bar} ${(similarity * 100).toFixed(1)}%`);
  }

  console.log('\n📈 카테고리별 부품 수:');
  for (const [category, count] of Object.entries(report.metrics.categoryCounts)) {
    console.log(`  ${category.padEnd(10)}: ${count}개`);
  }

  console.log('\n🔍 해석:');
  console.log(`  응집도: ${report.interpretation.cohesion}`);
  console.log(`  분리도: ${report.interpretation.separation}`);
  console.log(`  종합:   ${report.interpretation.overall}`);

  if (report.interpretation.recommendations.length > 0) {
    console.log('\n💡 권장사항:');
    for (const rec of report.interpretation.recommendations) {
      console.log(`  • ${rec}`);
    }
  }

  console.log('\n' + '='.repeat(60));
}

/**
 * Main evaluation function
 */
async function runEmbeddingEvaluation(): Promise<void> {
  console.log('=== 임베딩 품질 평가 시작 ===\n');

  const config = DEFAULT_CONFIG;

  if (process.argv.includes('--verbose') || process.argv.includes('-v')) {
    config.verbose = true;
  }

  // Fetch parts with embeddings
  console.log('📥 부품 및 임베딩 데이터 로드 중...');
  const parts = await fetchPartsWithEmbeddings(config);

  if (parts.length === 0) {
    console.error('❌ 임베딩이 있는 부품을 찾을 수 없습니다.');
    console.log('   로컬 서버가 실행 중인지 확인하세요: npm run dev:local');
    process.exit(1);
  }

  console.log(`   ${parts.length}개 부품 로드 완료\n`);

  // Calculate metrics
  console.log('📊 클러스터링 메트릭 계산 중...');

  const intraSimilarity = calculateIntraCategorySimilarity(parts);
  console.log('   ✓ 카테고리 내 유사도 계산 완료');

  const interSimilarity = calculateInterCategorySimilarity(parts);
  console.log('   ✓ 카테고리 간 유사도 계산 완료');

  const silhouetteScore = calculateSilhouetteScore(parts);
  console.log('   ✓ Silhouette Score 계산 완료');

  const knnAccuracy = calculateKNNAccuracy(parts, 3);
  console.log('   ✓ KNN 분류 정확도 계산 완료');

  // Count parts by category
  const categoryCounts: Record<string, number> = {};
  for (const part of parts) {
    categoryCounts[part.category] = (categoryCounts[part.category] || 0) + 1;
  }

  // Generate visualization data
  console.log('\n🎨 시각화 데이터 생성 중...');
  const visualization = generateVisualization(parts);

  // Generate interpretation
  const interpretation = interpretMetrics(
    intraSimilarity,
    interSimilarity,
    silhouetteScore,
    knnAccuracy
  );

  // Build report
  const report: EmbeddingReport = {
    timestamp: new Date().toISOString(),
    config,
    metrics: {
      intraCategorySimilarity: Object.fromEntries(intraSimilarity),
      interCategorySimilarity: interSimilarity,
      silhouetteScore,
      knnAccuracy,
      totalParts: parts.length,
      categoryCounts,
    },
    interpretation,
  };

  // Ensure output directory exists
  const outputDir = dirname(config.outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Save reports
  writeFileSync(config.outputPath, JSON.stringify(report, null, 2));
  console.log(`💾 메트릭 저장: ${config.outputPath}`);

  writeFileSync(config.visualizationPath, JSON.stringify(visualization, null, 2));
  console.log(`💾 시각화 데이터 저장: ${config.visualizationPath}`);

  // Print summary
  printSummary(report);
}

// Run if executed directly
runEmbeddingEvaluation().catch(error => {
  console.error('Embedding evaluation failed:', error);
  process.exit(1);
});
