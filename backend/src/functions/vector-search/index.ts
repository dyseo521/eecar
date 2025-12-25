import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import crypto from 'crypto';
import { generateEmbedding, findTopKSimilar, callClaude } from '/opt/nodejs/utils/bedrock.js';
import { getVector, listVectorKeys } from '/opt/nodejs/utils/s3.js';
import { getItem, putItem, queryGSI1, batchGetItems } from '/opt/nodejs/utils/dynamodb.js';
import { successResponse, errorResponse } from '/opt/nodejs/utils/response.js';
import { hybridSearch, preparePartForBM25 } from '/opt/nodejs/utils/search.js';

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
  try {
    const prompt = `전기차 부품 검색 쿼리를 확장해주세요. 유사한 의미의 검색어 3개를 JSON 배열로만 응답해주세요.
입력: "${query}"
예시 입력: "배터리"
예시 출력: ["배터리 팩", "리튬이온 셀", "에너지 저장 모듈"]

JSON 배열만 출력하세요:`;

    const response = await callClaude([{ role: 'user', content: prompt }], undefined, 150);

    // Parse JSON response, handle potential formatting issues
    const cleanedResponse = response.trim().replace(/```json\n?|\n?```/g, '');
    const expandedQueries = JSON.parse(cleanedResponse);

    if (Array.isArray(expandedQueries) && expandedQueries.length > 0) {
      // Return original query + expanded queries (deduplicated)
      const allQueries = [query, ...expandedQueries.slice(0, 3)];
      return [...new Set(allQueries)];
    }

    return [query]; // Fallback to original query
  } catch (error) {
    console.error('Query expansion failed:', error);
    return [query]; // Fallback to original query on error
  }
}

/**
 * Generate embeddings for multiple queries and average them
 */
async function generateMultiQueryEmbedding(queries: string[]): Promise<number[]> {
  // Generate embeddings for all queries in parallel
  const embeddings = await Promise.all(
    queries.map(q => generateEmbedding(q))
  );

  if (embeddings.length === 1) {
    return embeddings[0];
  }

  // Average all embeddings
  const vectorLength = embeddings[0].length;
  const averaged: number[] = new Array(vectorLength).fill(0);

  for (const embedding of embeddings) {
    for (let i = 0; i < vectorLength; i++) {
      averaged[i] += embedding[i];
    }
  }

  for (let i = 0; i < vectorLength; i++) {
    averaged[i] /= embeddings.length;
  }

  // Normalize the averaged vector
  let norm = 0;
  for (let i = 0; i < vectorLength; i++) {
    norm += averaged[i] * averaged[i];
  }
  norm = Math.sqrt(norm);

  for (let i = 0; i < vectorLength; i++) {
    averaged[i] /= norm;
  }

  return averaged;
}

/**
 * Vector Search Lambda Function
 * AI-powered semantic search for parts matching
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const { query, filters, topK = 10 } = body;

    if (!query) {
      return errorResponse('Query is required', undefined, 400, event);
    }

    console.log('Processing search query:', query);

    // Step 1: Check cache
    const queryHash = crypto.createHash('md5').update(query).digest('hex');
    const cachedResult = await getItem(`MATCH#${queryHash}`, 'RESULT');

    if (cachedResult && cachedResult.TTL && Date.now() < cachedResult.TTL * 1000) {
      console.log('Cache hit!');
      await incrementCacheHit(queryHash);
      return successResponse({
        results: cachedResult.matchedParts,
        cached: true,
      }, 200, event);
    }

    // Step 2: Query Expansion (RAG Enhancement)
    console.log('Expanding query for better recall...');
    const expandedQueries = await expandQuery(query);
    console.log('Expanded queries:', expandedQueries);

    // Step 3: Generate combined embedding from expanded queries
    console.log('Generating query embedding...');
    const queryEmbedding = await generateMultiQueryEmbedding(expandedQueries);

    // Step 4-5: Vector Search (with feature flag support)
    let vectorMatches: Array<{ id: string; score: number }>;
    const candidateCount = topK * 2;

    if (USE_KNOWLEDGE_BASE && KNOWLEDGE_BASE_ID) {
      // Option 1: Bedrock Knowledge Base (fully managed RAG)
      console.log('Using Bedrock Knowledge Base for search...');
      vectorMatches = await searchWithKnowledgeBase(query, candidateCount, filters);
      console.log(`Knowledge Base returned ${vectorMatches.length} results`);
    } else if (USE_S3_VECTORS && S3_VECTORS_BUCKET) {
      // Option 2: S3 Vectors (server-side vector search, O(log n))
      console.log('Using S3 Vectors for search...');
      vectorMatches = await searchWithS3Vectors(queryEmbedding, candidateCount, filters);
      console.log(`S3 Vectors returned ${vectorMatches.length} results`);
    } else {
      // Option 3: Legacy S3 JSON vectors (client-side search, O(n))
      console.log('Using legacy S3 JSON vectors...');
      vectorMatches = await searchWithLegacy(queryEmbedding, candidateCount);
      console.log(`Legacy search returned ${vectorMatches.length} results`);
    }

    // Step 6: Fetch part metadata for hybrid search
    const candidateIds = vectorMatches.map(m => ({ pk: `PART#${m.id}`, sk: 'METADATA' }));
    const allCandidateParts = await batchGetItems(candidateIds);

    // Step 7: Hybrid Search - combine vector + BM25 scores
    console.log('Applying hybrid search (vector + BM25)...');
    const partsForBM25 = allCandidateParts.map(p => ({
      id: p.PK.split('#')[1],
      text: preparePartForBM25(p)
    }));

    const hybridResults = hybridSearch(vectorMatches, partsForBM25, query, 0.7);
    console.log(`Hybrid search completed: ${hybridResults.length} candidates`);

    // Create parts map for enrichment
    const partsMap = new Map(allCandidateParts.map(p => [p.PK.split('#')[1], p]));

    // Step 8: Use Hybrid Score directly (skip Claude re-ranking to avoid throttling)
    // Hybrid search already combines Vector + BM25 scores for good precision
    const topMatches = hybridResults.slice(0, topK);
    console.log(`Using top ${topMatches.length} hybrid results (skipping Claude re-ranking)`);

    const parts = topMatches.map(m => partsMap.get(m.id)).filter(Boolean);

    // Step 9: Generate AI explanations sequentially to avoid throttling
    console.log('Generating AI explanations (sequential to avoid throttling)...');
    const enrichedResults = await enrichWithAISequential(query, topMatches, parts);

    // Step 10: Apply filters if provided
    let filteredResults = enrichedResults;
    if (filters) {
      filteredResults = applyFilters(enrichedResults, filters);
    }

    // Step 11: Cache the results (7 days TTL)
    const ttl = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
    await putItem({
      PK: `MATCH#${queryHash}`,
      SK: 'RESULT',
      query,
      expandedQueries, // RAG Enhancement: Store expanded queries for debugging
      matchedParts: filteredResults,
      modelUsed: process.env.BEDROCK_MODEL_ID || 'haiku',
      createdAt: new Date().toISOString(),
      hitCount: 1,
      TTL: ttl,
      GSI1PK: 'CACHE',
      GSI1SK: `HIT_COUNT#${1}`,
    });

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
 */
async function rerankWithClaude(
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

  const partsInfo = matches.map((match, index) => {
    const part = partsMap.get(match.id);
    if (!part) return null;
    return `${index + 1}. [${match.id}] ${part.name} (${part.manufacturer}, ${part.category})`;
  }).filter(Boolean).join('\n');

  const batchPrompt = `"${query}" 검색에 왜 이 부품들이 적합한지 이유를 각각 20-30자로 작성.
"~이므로 적합", "~와 호환", "~에 사용 가능" 형식으로.

반드시 JSON 배열 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요.
형식: ["이유1","이유2",...]

부품 목록:
${partsInfo}

JSON 배열:`;

  let explanations: string[] = [];
  let response = '';  // 스코프 문제 해결

  try {
    response = await callClaude([{ role: 'user', content: batchPrompt }], undefined, 1800);
    
    // Claude 응답에서 JSON 추출 (여러 형식 처리)
    let jsonStr = response.trim();
    
    // ```json ... ``` 형식 제거
    jsonStr = jsonStr.replace(/^```json\s*|\s*```$/g, '');
    
    // 배열 찾기 (non-greedy로 변경)
    const jsonMatch = jsonStr.match(/\[[\s\S]*?\]/);
    
    if (jsonMatch) {
      explanations = JSON.parse(jsonMatch[0]);
      
      // 배열 길이 검증
      if (!Array.isArray(explanations) || explanations.length !== matches.length) {
        console.warn(`Expected ${matches.length} explanations, got ${explanations.length}`);
        // 부족하면 기본값으로 채우기
        while (explanations.length < matches.length) {
          explanations.push('유사도 기반 매칭');
        }
      }
    } else {
      console.error('No JSON array found in response:', response.substring(0, 200));
      explanations = matches.map(() => '유사도 기반 매칭');
    }
  } catch (error) {
    console.error('Batch explanation generation failed:', error);
    console.error('Raw response:', response.substring(0, 200));
    explanations = matches.map(() => '유사도 기반 매칭');
  }

  // Build results with explanations
  return matches.map((match, index) => {
    const part = partsMap.get(match.id);
    if (!part) return null;

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
      reason: explanations[index] || '유사도 기반 매칭',
    };
  }).filter(Boolean);
}

/**
 * Enrich matches with AI-generated explanations (parallel - may cause throttling)
 */
async function enrichWithAI(
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
 * Apply filters to search results
 */
function applyFilters(results: any[], filters: any): any[] {
  return results.filter(result => {
    const part = result.part;

    if (filters.category && part.category !== filters.category) {
      return false;
    }

    if (filters.maxPrice && part.price > filters.maxPrice) {
      return false;
    }

    if (filters.minQuantity && part.quantity < filters.minQuantity) {
      return false;
    }

    if (filters.manufacturer && part.manufacturer !== filters.manufacturer) {
      return false;
    }

    return true;
  });
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
