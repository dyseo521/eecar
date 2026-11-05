import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import crypto from 'crypto';
import { generateEmbedding, findTopKSimilar, callClaude } from '/opt/nodejs/utils/bedrock.js';
import { getVector, listVectorKeys } from '/opt/nodejs/utils/s3.js';
import { getItem, putItem, batchGetItems, DynamoDBItem } from '/opt/nodejs/utils/dynamodb.js';
import { successResponse, errorResponse, parseJsonBody } from '/opt/nodejs/utils/response.js';
import { CANDIDATES_PER_RETRIEVER, fuseRankedLists, HYBRID_ALPHA } from '/opt/nodejs/utils/search.js';
import { getSearchIndex, partIdOf } from '/opt/nodejs/utils/search-index.js';
import { SEARCH_DOCUMENT_VERSION } from '/opt/nodejs/utils/search-document.js';
import {
  averageEmbeddings,
  expandSearchQuery,
  generateExplanations,
  FALLBACK_REASON,
  TextGenerator,
} from '/opt/nodejs/utils/search-llm.js';
import { emitMetrics } from '/opt/nodejs/utils/emf.js';

const generateWithClaude: TextGenerator = (prompt, maxTokens) =>
  callClaude([{ role: 'user', content: prompt }], undefined, maxTokens);

// 쿼리 확장은 측정상 품질 이득이 없어 기본값을 끈다 (DECISION_LOG E-18, E-19)
const QUERY_EXPANSION_ENABLED = process.env.QUERY_EXPANSION_ENABLED === 'true';
const METRICS_NAMESPACE = 'EECAR/Search';

/**
 * LLM 호출 결과를 지표로 남긴다. 폴백은 응답이 200이어도 기능이 꺼진 상태라
 * 에러율만 보면 드러나지 않는다 (C-09: 퇴역 모델로 AI 기능이 조용히 꺼졌던 장애).
 * Feature 차원별 값과 차원 없는 합계를 함께 발행해 합계에 알람을 건다.
 */
function recordLlmCall(feature: string, latencyMs: number, fallback: boolean): void {
  emitMetrics(METRICS_NAMESPACE, { Feature: feature }, {
    LLMCalls: { value: 1, unit: 'Count' },
    LLMFallback: { value: fallback ? 1 : 0, unit: 'Count' },
    LLMLatency: { value: latencyMs, unit: 'Milliseconds' },
  }, [['Feature'], []]);
}

/**
 * 검색 SLI: 요청 수, 캐시 적중, 결과 0건 (C-06처럼 에러 없는 조용한 장애를 잡기 위함)과
 * 단계별 지연 (어느 단계가 응답 시간을 차지하는지 보기 위함, C-08)
 */
function recordSearch(cached: boolean, resultCount: number, timings: Record<string, number>): void {
  emitMetrics(METRICS_NAMESPACE, { Operation: 'Search' }, {
    SearchRequests: { value: 1, unit: 'Count' },
    CacheHit: { value: cached ? 1 : 0, unit: 'Count' },
    ZeroResult: { value: resultCount === 0 ? 1 : 0, unit: 'Count' },
    ...Object.fromEntries(Object.entries(timings).map(([name, ms]) => [name, { value: ms, unit: 'Milliseconds' as const }])),
  });
}

/** 검색 파이프라인 정의가 바뀌면 올린다. 캐시 키에 들어가므로 배포 직후 이전 파이프라인의 결과가 나가지 않는다 */
export const SEARCH_PIPELINE_VERSION = `fusion-v2.doc-v${SEARCH_DOCUMENT_VERSION}`;

/**
 * 결과 캐시 키. 이전에는 질의 문자열만 써서 필터·topK가 다른 요청에 같은 결과를 돌려줬다 (C-04).
 */
export function searchCacheKey(query: string, filters: Record<string, unknown> | undefined, topK: number): string {
  const canonicalFilters = filters
    ? Object.fromEntries(Object.keys(filters).sort().map(key => [key, filters[key]]))
    : null;
  return crypto
    .createHash('md5')
    .update(JSON.stringify({ q: query, f: canonicalFilters, k: topK, v: SEARCH_PIPELINE_VERSION }))
    .digest('hex');
}

// Feature flags for gradual rollout
const USE_S3_VECTORS = process.env.USE_S3_VECTORS === 'true';
const USE_KNOWLEDGE_BASE = process.env.USE_KNOWLEDGE_BASE === 'true';

// S3 Vectors configuration
const S3_VECTORS_BUCKET = process.env.S3_VECTORS_BUCKET || '';
const S3_VECTORS_INDEX = process.env.S3_VECTORS_INDEX || 'parts-vectors';

// Bedrock Knowledge Base configuration
const KNOWLEDGE_BASE_ID = process.env.KNOWLEDGE_BASE_ID || '';

/**
 * Search using S3 Vectors (server-side vector search)
 * Provides O(log n) performance vs O(n) for legacy approach
 *
 * API Reference: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3vectors/
 */
async function searchWithS3Vectors(
  queryEmbedding: number[],
  topK: number,
  filters?: any
): Promise<Array<{ id: string; score: number }>> {
  // Dynamic import for S3 Vectors client
  const { S3VectorsClient, QueryVectorsCommand } = await import('@aws-sdk/client-s3vectors');

  const client = new S3VectorsClient({ region: 'ap-northeast-2' });

  // Build filter expression if provided
  // S3 Vectors uses simple key-value filters on metadata
  let filter: Record<string, string> | undefined = undefined;
  if (filters?.category) {
    filter = { category: filters.category };
  }

  const response = await client.send(
    new QueryVectorsCommand({
      vectorBucketName: S3_VECTORS_BUCKET,
      indexName: S3_VECTORS_INDEX,
      queryVector: {
        float32: queryEmbedding, // number[] is auto-converted
      },
      topK,
      filter,
      returnMetadata: true,
      returnDistance: true,
    })
  );

  // S3 Vectors returns distance (lower = more similar for cosine)
  // Convert to score (higher = more similar) for compatibility
  return (response.vectors || []).map(v => ({
    id: v.key!,
    score: v.distance !== undefined ? 1 - v.distance : 0,
  }));
}

/**
 * Search using Bedrock Knowledge Base
 * Fully managed RAG with automatic chunking and retrieval
 */
async function searchWithKnowledgeBase(
  query: string,
  topK: number,
  filters?: any
): Promise<Array<{ id: string; score: number; content?: string }>> {
  // Dynamic import for Bedrock Agent Runtime
  const { BedrockAgentRuntimeClient, RetrieveCommand } = await import('@aws-sdk/client-bedrock-agent-runtime');

  const client = new BedrockAgentRuntimeClient({ region: 'ap-northeast-2' });

  // Build filter for Knowledge Base
  let kbFilter: any = undefined;
  if (filters?.category) {
    kbFilter = {
      equals: { key: 'category', value: filters.category }
    };
  }

  const response = await client.send(
    new RetrieveCommand({
      knowledgeBaseId: KNOWLEDGE_BASE_ID,
      retrievalQuery: { text: query },
      retrievalConfiguration: {
        vectorSearchConfiguration: {
          numberOfResults: topK,
          filter: kbFilter,
        }
      }
    })
  );

  return (response.retrievalResults || []).map((r: any) => ({
    id: r.metadata?.partId as string || '',
    score: r.score || 0,
    content: r.content?.text,
  }));
}

/**
 * Legacy search using S3 JSON vectors (current approach)
 */
async function searchWithLegacy(
  queryEmbedding: number[],
  topK: number
): Promise<Array<{ id: string; score: number }>> {
  const vectorKeys = await listVectorKeys('parts/');

  const vectorPromises = vectorKeys.map(async (key) => {
    const vector = await getVector(key);
    if (vector) {
      const partId = key.split('/')[1].replace('.json', '');
      return { id: partId, vector };
    }
    return null;
  });

  const vectorResults = await Promise.all(vectorPromises);
  const vectors = vectorResults.filter((v): v is { id: string; vector: number[] } => v !== null);

  return findTopKSimilar(queryEmbedding, vectors, topK);
}

/**
 * Expand query using Claude for better recall
 * Generates semantically similar queries to improve search coverage
 */
async function expandQuery(query: string): Promise<string[]> {
  if (!QUERY_EXPANSION_ENABLED) {
    return [query];
  }
  const started = Date.now();
  const result = await expandSearchQuery(query, generateWithClaude);
  recordLlmCall('QueryExpansion', Date.now() - started, result.fallback);
  return result.queries;
}

/**
 * Generate embeddings for multiple queries and average them
 */
async function generateMultiQueryEmbedding(queries: string[]): Promise<number[]> {
  const embeddings = await Promise.all(queries.map(q => generateEmbedding(q)));
  return averageEmbeddings(embeddings);
}

/** 설정된 벡터 저장소에서 질의 임베딩과 가까운 부품 상위 topK개 */
async function vectorSearch(
  query: string,
  queryEmbedding: number[],
  topK: number,
  filters?: any
): Promise<Array<{ id: string; score: number }>> {
  if (USE_KNOWLEDGE_BASE && KNOWLEDGE_BASE_ID) {
    return searchWithKnowledgeBase(query, topK, filters);
  }
  if (USE_S3_VECTORS && S3_VECTORS_BUCKET) {
    return searchWithS3Vectors(queryEmbedding, topK, filters);
  }
  return searchWithLegacy(queryEmbedding, topK);
}

async function timed<T>(timings: Record<string, number>, name: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    return await fn();
  } finally {
    timings[name] = Date.now() - started;
  }
}

/**
 * Vector Search Lambda Function
 *
 * 질의 임베딩 → (벡터 상위 100 ∥ BM25 색인 적재) → BM25 상위 100 → 볼록 결합 → 필터 → 상위 topK → 결과 설명
 * 벡터와 BM25는 서로의 후보에 의존하지 않는다 (DECISION_LOG E-23).
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const started = Date.now();
  const timings: Record<string, number> = {};
  try {
    const parsed = parseJsonBody(event);
    if (!parsed.ok) {
      return parsed.response;
    }
    const body = parsed.body;
    const { query, filters, topK = 10 } = body;

    if (!query) {
      return errorResponse('Query is required', undefined, 400, event);
    }

    console.log('Processing search query:', query);

    // Step 1: Check cache
    const queryHash = searchCacheKey(query, filters, topK);
    const cachedResult = await getItem(`MATCH#${queryHash}`, 'RESULT');

    if (cachedResult && cachedResult.TTL && Date.now() < cachedResult.TTL * 1000) {
      console.log('Cache hit!');
      await incrementCacheHit(queryHash);
      recordSearch(true, (cachedResult.matchedParts || []).length, { TotalMs: Date.now() - started });
      return successResponse({
        results: cachedResult.matchedParts,
        cached: true,
      }, 200, event);
    }

    // Step 2: Query Expansion (기본 꺼짐)
    const expandedQueries = await expandQuery(query);

    // Step 3: 질의 임베딩
    const queryEmbedding = await timed(timings, 'EmbeddingMs', () => generateMultiQueryEmbedding(expandedQueries));

    // Step 4: 벡터 검색과 BM25 색인 적재를 동시에 (서로 의존하지 않음)
    const [vectorMatches, { index, loaded }] = await Promise.all([
      timed(timings, 'VectorSearchMs', () => vectorSearch(query, queryEmbedding, CANDIDATES_PER_RETRIEVER, filters)),
      timed(timings, 'IndexLoadMs', () => getSearchIndex()),
    ]);

    // Step 5: BM25 독립 검색 + 결합
    const fusionStarted = Date.now();
    const bm25Matches = index.bm25.search(query, CANDIDATES_PER_RETRIEVER);
    const fused = fuseRankedLists(vectorMatches, bm25Matches, HYBRID_ALPHA);
    timings.FusionMs = Date.now() - fusionStarted;
    console.log(`vector ${vectorMatches.length}, bm25 ${bm25Matches.length} (index ${index.bm25.size}${loaded ? ', loaded' : ''}) -> fused ${fused.length}`);

    // Step 6: 메타데이터. 색인에 없는 부품(색인 적재 뒤에 등록된 부품)만 따로 읽는다
    const partsMap = new Map<string, DynamoDBItem>();
    const missing: Array<{ pk: string; sk: string }> = [];
    for (const hit of fused) {
      const item = index.parts.get(hit.id);
      if (item) partsMap.set(hit.id, item);
      else missing.push({ pk: `PART#${hit.id}`, sk: 'METADATA' });
    }
    if (missing.length > 0) {
      for (const item of await batchGetItems(missing)) partsMap.set(partIdOf(item), item);
    }

    // Step 7: 필터를 상위 topK로 자르기 전에 적용 (이전에는 자른 뒤 적용해 결과가 줄었다, C-05)
    const topMatches = fused
      .filter(hit => partsMap.has(hit.id) && matchesFilters(partsMap.get(hit.id), filters))
      .slice(0, topK);
    const parts = topMatches.map(m => partsMap.get(m.id));

    // Step 8: 결과 설명 (단일 프롬프트)
    const filteredResults = await timed(timings, 'ExplanationMs', () => enrichWithAISequential(query, topMatches, parts));

    // Step 9: Cache the results (7 days TTL)
    const ttl = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
    await putItem({
      PK: `MATCH#${queryHash}`,
      SK: 'RESULT',
      query,
      filters: filters ?? null,
      pipelineVersion: SEARCH_PIPELINE_VERSION,
      expandedQueries,
      matchedParts: filteredResults,
      modelUsed: process.env.BEDROCK_MODEL_ID || 'haiku',
      createdAt: new Date().toISOString(),
      hitCount: 1,
      TTL: ttl,
      GSI1PK: 'CACHE',
      GSI1SK: `HIT_COUNT#${1}`,
    });

    timings.TotalMs = Date.now() - started;
    recordSearch(false, filteredResults.length, timings);
    return successResponse({
      results: filteredResults,
      expandedQueries, // Include expanded queries in response for transparency
      cached: false,
    }, 200, event);
  } catch (error: any) {
    console.error('Error in vector search:', error);
    return errorResponse('Internal server error', error.message, 500, event);
  }
}

/**
 * Hybrid match result with both vector and BM25 scores
 */
interface HybridMatch {
  id: string;
  score: number;
  vectorScore?: number;
  bm25Score?: number;
}

/**
 * Re-rank top candidates using Claude for more precise relevance scoring
 * This provides a second-pass ranking with deeper semantic understanding
 * (현재 미사용 - throttling 방지를 위해 hybridSearch 결과 직접 사용)
 */
async function _rerankWithClaude(
  query: string,
  candidates: HybridMatch[],
  parts: Map<string, any>,
  topN: number = 5
): Promise<HybridMatch[]> {
  console.log(`Re-ranking ${candidates.length} candidates with Claude...`);

  // Score each candidate with Claude
  const rerankPromises = candidates.map(async (candidate) => {
    const part = parts.get(candidate.id);
    if (!part) return { ...candidate, rerankScore: 0 };

    try {
      const prompt = `검색 쿼리와 부품의 관련성을 1-10점으로 평가해주세요. 숫자만 응답하세요.

검색 쿼리: "${query}"

부품 정보:
- 부품명: ${part.name}
- 카테고리: ${part.category}
- 제조사: ${part.manufacturer}
- 설명: ${part.description || '없음'}

점수 (1-10):`;

      const response = await callClaude([{ role: 'user', content: prompt }], undefined, 10);
      const score = parseInt(response.trim(), 10);

      return {
        ...candidate,
        rerankScore: isNaN(score) ? 5 : Math.min(10, Math.max(1, score)) / 10,
      };
    } catch (error) {
      console.error(`Re-ranking failed for ${candidate.id}:`, error);
      return { ...candidate, rerankScore: 0.5 }; // Default middle score
    }
  });

  const reranked = await Promise.all(rerankPromises);

  // Combine original hybrid score with rerank score (60% hybrid + 40% rerank)
  const finalScored = reranked.map(r => ({
    ...r,
    finalScore: 0.6 * r.score + 0.4 * (r.rerankScore || 0.5),
  }));

  // Sort by final score and return top N
  return finalScored
    .sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0))
    .slice(0, topN)
    .map(r => ({
      id: r.id,
      score: r.finalScore || r.score,
      vectorScore: r.vectorScore,
      bm25Score: r.bm25Score,
    }));
}

/**
 * Enrich matches with AI-generated explanations (batch processing - single Claude call)
 * Uses one prompt to generate all explanations at once, avoiding throttling
 */
async function enrichWithAISequential(
  query: string,
  matches: HybridMatch[],
  parts: any[]
): Promise<any[]> {
  const partsMap = new Map(parts.map(p => [p.PK.split('#')[1], p]));

  // 메타데이터가 있는 부품만 프롬프트에 넣고, 설명도 같은 순서로 매칭한다
  // (이전에는 빠진 부품이 있으면 뒤쪽 부품의 설명이 한 칸씩 밀렸다)
  const present = matches.filter(match => partsMap.has(match.id));
  if (present.length === 0) {
    return [];
  }
  const items = present.map(match => {
    const part = partsMap.get(match.id);
    return { id: match.id, name: part.name, manufacturer: part.manufacturer, category: part.category };
  });
  const started = Date.now();
  const { explanations, fallback } = await generateExplanations(query, items, generateWithClaude);
  recordLlmCall('Explanation', Date.now() - started, fallback);

  // Build results with explanations
  return present.map((match, index) => {
    const part = partsMap.get(match.id);

    return {
      partId: match.id,
      score: match.score,
      searchScores: {
        hybrid: match.score,
        vector: match.vectorScore,
        bm25: match.bm25Score,
      },
      part: {
        name: part.name,
        category: part.category,
        manufacturer: part.manufacturer,
        model: part.model,
        price: part.price,
        quantity: part.quantity,
        images: part.images || [],
      },
      reason: explanations[index] || FALLBACK_REASON,
    };
  });
}

/**
 * Enrich matches with AI-generated explanations (parallel - may cause throttling)
 * (현재 미사용 - throttling 방지를 위해 enrichWithAISequential 사용)
 */
async function _enrichWithAI(
  query: string,
  matches: HybridMatch[],
  parts: any[]
): Promise<any[]> {
  const partsMap = new Map(parts.map(p => [p.PK.split('#')[1], p]));

  // Parallelize Claude calls for better performance (use enrichWithAISequential if throttled)
  const enrichmentPromises = matches.map(async (match) => {
    const part = partsMap.get(match.id);
    if (!part) return null;

    // Generate explanation using Claude
    const prompt = `다음 부품이 "${query}" 검색 니즈에 적합한 이유를 한 문장으로 간단히 설명해주세요:

- 부품명: ${part.name}
- 카테고리: ${part.category}
- 제조사: ${part.manufacturer}
- 설명: ${part.description}

설명에는 검색어를 언급하지 말고, 부품의 특징과 적합한 이유만 간결하게 작성해주세요.`;

    try {
      const explanation = await callClaude([{ role: 'user', content: prompt }], undefined, 150);

      return {
        partId: match.id,
        score: match.score,
        // Include hybrid search breakdown for transparency
        searchScores: {
          hybrid: match.score,
          vector: match.vectorScore,
          bm25: match.bm25Score,
        },
        part: {
          name: part.name,
          category: part.category,
          manufacturer: part.manufacturer,
          model: part.model,
          price: part.price,
          quantity: part.quantity,
          images: part.images || [],
        },
        reason: explanation.trim(),
      };
    } catch (error) {
      console.error(`Failed to generate explanation for part ${match.id}:`, error);
      return {
        partId: match.id,
        score: match.score,
        searchScores: {
          hybrid: match.score,
          vector: match.vectorScore,
          bm25: match.bm25Score,
        },
        part: {
          name: part.name,
          category: part.category,
          manufacturer: part.manufacturer,
          model: part.model,
          price: part.price,
          quantity: part.quantity,
          images: part.images || [],
        },
        reason: '유사도 기반 매칭',
      };
    }
  });

  const enrichmentResults = await Promise.all(enrichmentPromises);
  return enrichmentResults.filter((r): r is NonNullable<typeof r> => r !== null);
}

/**
 * 부품 METADATA가 요청 필터를 만족하는지
 */
export function matchesFilters(part: any, filters: any): boolean {
  if (!filters) return true;
  if (filters.category && part.category !== filters.category) return false;
  if (filters.maxPrice && part.price > filters.maxPrice) return false;
  if (filters.minQuantity && part.quantity < filters.minQuantity) return false;
  if (filters.manufacturer && part.manufacturer !== filters.manufacturer) return false;
  return true;
}

/**
 * Increment cache hit counter
 */
async function incrementCacheHit(queryHash: string): Promise<void> {
  const item = await getItem(`MATCH#${queryHash}`, 'RESULT');
  if (item) {
    const newHitCount = (item.hitCount || 1) + 1;
    await putItem({
      ...item,
      hitCount: newHitCount,
      GSI1SK: `HIT_COUNT#${newHitCount}`,
    });
  }
}
