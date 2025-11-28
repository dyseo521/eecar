import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import crypto from 'crypto';
import { generateEmbedding, findTopKSimilar, callClaude } from '/opt/nodejs/utils/bedrock.js';
import { getVector, listVectorKeys } from '/opt/nodejs/utils/s3.js';
import { getItem, putItem, queryGSI1, batchGetItems } from '/opt/nodejs/utils/dynamodb.js';
import { successResponse, errorResponse } from '/opt/nodejs/utils/response.js';

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

    // Step 2: Generate query embedding
    console.log('Generating query embedding...');
    const queryEmbedding = await generateEmbedding(query);

    // Step 3: Load all part vectors from S3 (parallelized for performance)
    console.log('Loading part vectors...');
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

    console.log(`Loaded ${vectors.length} part vectors`);

    // Step 4: Find top-K similar parts
    const topMatches = findTopKSimilar(queryEmbedding, vectors, topK);

    // Step 5: Fetch part metadata from DynamoDB
    const partIds = topMatches.map(m => ({ pk: `PART#${m.id}`, sk: 'METADATA' }));
    const parts = await batchGetItems(partIds);

    // Step 6: Use Claude to generate explanations for matches
    console.log('Generating AI explanations...');
    const enrichedResults = await enrichWithAI(query, topMatches, parts);

    // Step 7: Apply filters if provided
    let filteredResults = enrichedResults;
    if (filters) {
      filteredResults = applyFilters(enrichedResults, filters);
    }

    // Step 8: Cache the results (7 days TTL)
    const ttl = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
    await putItem({
      PK: `MATCH#${queryHash}`,
      SK: 'RESULT',
      query,
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
      cached: false,
    }, 200, event);
  } catch (error: any) {
    console.error('Error in vector search:', error);
    return errorResponse('Internal server error', error.message, 500, event);
  }
}

/**
 * Enrich matches with AI-generated explanations
 */
async function enrichWithAI(
  query: string,
  matches: Array<{ id: string; score: number }>,
  parts: any[]
): Promise<any[]> {
  const partsMap = new Map(parts.map(p => [p.PK.split('#')[1], p]));

  // Parallelize Claude calls for better performance
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
