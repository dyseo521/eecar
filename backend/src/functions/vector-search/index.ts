import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import crypto from 'crypto';
import { generateEmbedding, findTopKSimilar, callClaude } from '../../utils/bedrock';
import { getVector, listVectorKeys } from '../../utils/s3';
import { getItem, putItem, queryGSI1, batchGetItems } from '../../utils/dynamodb';

/**
 * Vector Search Lambda Function
 * AI-powered semantic search for parts matching
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const { query, filters, topK = 10 } = body;

    if (!query) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Query is required' }),
      };
    }

    console.log('Processing search query:', query);

    // Step 1: Check cache
    const queryHash = crypto.createHash('md5').update(query).digest('hex');
    const cachedResult = await getItem(`MATCH#${queryHash}`, 'RESULT');

    if (cachedResult && Date.now() < cachedResult.TTL * 1000) {
      console.log('Cache hit!');
      await incrementCacheHit(queryHash);
      return {
        statusCode: 200,
        body: JSON.stringify({
          results: cachedResult.matchedParts,
          cached: true,
        }),
      };
    }

    // Step 2: Generate query embedding
    console.log('Generating query embedding...');
    const queryEmbedding = await generateEmbedding(query);

    // Step 3: Load all part vectors from S3
    console.log('Loading part vectors...');
    const vectorKeys = await listVectorKeys('parts/');
    const vectors: Array<{ id: string; vector: number[] }> = [];

    for (const key of vectorKeys) {
      const vector = await getVector(key);
      if (vector) {
        const partId = key.split('/')[1].replace('.json', '');
        vectors.push({ id: partId, vector });
      }
    }

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

    return {
      statusCode: 200,
      body: JSON.stringify({
        results: filteredResults,
        cached: false,
      }),
    };
  } catch (error: any) {
    console.error('Error in vector search:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error', message: error.message }),
    };
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

  const enriched = [];

  for (const match of matches) {
    const part = partsMap.get(match.id);
    if (!part) continue;

    // Generate explanation using Claude
    const prompt = `사용자가 "${query}"를 검색했습니다.
다음 부품이 매칭되었습니다:
- 부품명: ${part.name}
- 카테고리: ${part.category}
- 제조사: ${part.manufacturer}
- 설명: ${part.description}

이 부품이 사용자의 니즈에 맞는 이유를 한 문장으로 간단히 설명해주세요.`;

    try {
      const explanation = await callClaude([{ role: 'user', content: prompt }], undefined, 150);

      enriched.push({
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
      });
    } catch (error) {
      console.error(`Failed to generate explanation for part ${match.id}:`, error);
      enriched.push({
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
      });
    }
  }

  return enriched;
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
