/**
 * 검색 Lambda 흐름 테스트 (레거시 S3 JSON 벡터 경로, Claude 설명은 실패 → 폴백).
 * - 벡터와 BM25를 독립적으로 검색해 결합한다 (E-23)
 * - 필터를 상위 topK로 자르기 전에 적용한다 (C-05)
 * - 색인 적재 뒤에 등록된 부품은 METADATA를 따로 읽는다
 * - 캐시 키에 필터와 파이프라인 버전이 들어간다 (C-04)
 */
import { jest } from '@jest/globals';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { BatchGetCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { Readable } from 'stream';
import { sdkStreamMixin } from '@aws-sdk/util-stream-node';
import { handler, matchesFilters, searchCacheKey } from '../../src/functions/vector-search/index.js';
import { resetSearchIndexCache } from '../../src/utils/search-index.js';

const docMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);
const bedrockMock = mockClient(BedrockRuntimeClient);

const body = (data: unknown) => sdkStreamMixin(Readable.from([Buffer.from(JSON.stringify(data))]));

const metadata = (id: string, name: string, category: string, price = 1_000_000) => ({
  PK: `PART#${id}`, SK: 'METADATA', name, category, manufacturer: '현대', model: '', price, quantity: 1,
});

// 색인(GSI2)에 있는 부품 a·b·c, 색인 적재 뒤에 등록된 부품 d
const indexed = [
  metadata('a', '아이오닉5 배터리 팩', 'battery'),
  metadata('b', '아이오닉5 구동 모터', 'motor'),
  metadata('c', '코나 배터리 모듈', 'battery', 9_000_000),
];
const vectors: Record<string, number[]> = { a: [1, 0], b: [0.2, 0.98], c: [0.9, 0.1], d: [0.95, 0.05] };

function event(payload: unknown): APIGatewayProxyEvent {
  return { body: JSON.stringify(payload), headers: {} } as unknown as APIGatewayProxyEvent;
}

describe('vector-search handler', () => {
  beforeEach(() => {
    docMock.reset();
    s3Mock.reset();
    bedrockMock.reset();
    resetSearchIndexCache();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

    docMock.on(GetCommand).resolves({});
    docMock.on(PutCommand).resolves({});
    docMock.on(QueryCommand).resolves({ Items: indexed });
    docMock.on(BatchGetCommand).resolves({ Responses: { [String(process.env.PARTS_TABLE_NAME)]: [metadata('d', '아이오닉5 배터리 셀', 'battery')] } });

    s3Mock.on(GetObjectCommand, { Key: 'vectors-manifest.json' }).resolves({ Body: body(Object.keys(vectors).map(id => `parts/${id}.json`)) } as any);
    for (const [id, v] of Object.entries(vectors)) {
      s3Mock.on(GetObjectCommand, { Key: `parts/${id}.json` }).resolves({ Body: body(v) } as any);
    }

    bedrockMock.on(InvokeModelCommand).callsFake(input => {
      if (String(input.modelId).includes('titan-embed')) {
        return { body: new TextEncoder().encode(JSON.stringify({ embedding: [1, 0] })) };
      }
      throw new Error('claude unavailable in test');
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('combines vector and BM25 results and fetches parts missing from the index', async () => {
    const res = await handler(event({ query: '배터리', topK: 3 }));
    expect(res.statusCode).toBe(200);
    const ids = JSON.parse(res.body).data?.results?.map((r: any) => r.partId) ?? JSON.parse(res.body).results.map((r: any) => r.partId);
    expect(ids).toHaveLength(3);
    expect(ids).toContain('d');
    expect(ids).not.toContain('b');
    expect(docMock.commandCalls(BatchGetCommand)).toHaveLength(1);
  });

  it('applies filters before cutting to topK', async () => {
    // 모터는 벡터 순위가 가장 낮지만, 필터를 먼저 적용하므로 topK=1에서도 결과가 나온다
    const res = await handler(event({ query: '아이오닉5', topK: 1, filters: { category: 'motor' } }));
    const parsed = JSON.parse(res.body);
    const results = parsed.data?.results ?? parsed.results;
    expect(results.map((r: any) => r.partId)).toEqual(['b']);
  });

  it('rejects a request without a query', async () => {
    const res = await handler(event({}));
    expect(res.statusCode).toBe(400);
  });
});

describe('searchCacheKey', () => {
  it('differs by filters and topK but not by filter key order', () => {
    const base = searchCacheKey('배터리', undefined, 10);
    expect(searchCacheKey('배터리', { category: 'battery' }, 10)).not.toBe(base);
    expect(searchCacheKey('배터리', undefined, 5)).not.toBe(base);
    expect(searchCacheKey('배터리', { a: 1, b: 2 }, 10)).toBe(searchCacheKey('배터리', { b: 2, a: 1 }, 10));
  });
});

describe('matchesFilters', () => {
  const part = { category: 'battery', price: 5_000_000, quantity: 2, manufacturer: '현대' };
  it('checks each filter', () => {
    expect(matchesFilters(part, undefined)).toBe(true);
    expect(matchesFilters(part, { category: 'motor' })).toBe(false);
    expect(matchesFilters(part, { maxPrice: 4_000_000 })).toBe(false);
    expect(matchesFilters(part, { minQuantity: 3 })).toBe(false);
    expect(matchesFilters(part, { manufacturer: '기아' })).toBe(false);
    expect(matchesFilters(part, { category: 'battery', maxPrice: 6_000_000, minQuantity: 1 })).toBe(true);
  });
});
