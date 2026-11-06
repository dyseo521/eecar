import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  buildSearchIndex,
  getSearchIndex,
  partIdOf,
  resetSearchIndexCache,
  SEARCH_INDEX_TTL_MS,
} from '../../src/utils/search-index.js';
import { SEARCH_DOCUMENT_VERSION } from '../../src/utils/search-document.js';

const docMock = mockClient(DynamoDBDocumentClient);

const items = [
  { PK: 'PART#a', SK: 'METADATA', name: '아이오닉5 배터리 팩', category: 'battery' },
  {
    PK: 'PART#b',
    SK: 'METADATA',
    name: '모터',
    category: 'motor',
    searchText: '저장된 문서 영구자석 동기 모터',
    searchDocVersion: SEARCH_DOCUMENT_VERSION,
  },
];

describe('search index', () => {
  beforeEach(() => {
    docMock.reset();
    resetSearchIndexCache();
  });

  it('extracts the part id from the partition key', () => {
    expect(partIdOf({ PK: 'PART#abc-1', SK: 'METADATA' })).toBe('abc-1');
  });

  it('indexes the stored search text when present', () => {
    const index = buildSearchIndex(items);
    expect(index.bm25.size).toBe(2);
    expect(index.bm25.search('영구자석', 10).map(h => h.id)).toEqual(['b']);
    expect(index.bm25.search('배터리', 10).map(h => h.id)).toEqual(['a']);
    expect(index.parts.get('a')?.name).toBe('아이오닉5 배터리 팩');
  });

  it('loads metadata once and reuses it until the TTL expires', async () => {
    docMock.on(QueryCommand).resolves({ Items: items });
    const t0 = 1_000_000;

    const first = await getSearchIndex(t0);
    const second = await getSearchIndex(t0 + SEARCH_INDEX_TTL_MS - 1);
    const third = await getSearchIndex(t0 + SEARCH_INDEX_TTL_MS);

    expect(first.loaded).toBe(true);
    expect(second.loaded).toBe(false);
    expect(second.index).toBe(first.index);
    expect(third.loaded).toBe(true);
    expect(docMock.commandCalls(QueryCommand)).toHaveLength(2);
  });
});

describe('buildSearchIndex with malformed records', () => {
  const good = { PK: 'PART#good', SK: 'METADATA', name: '아이오닉5 배터리 팩', category: 'battery', manufacturer: '현대' };

  it('survives a non-string cathode type and still indexes the part', () => {
    const odd = { PK: 'PART#odd', SK: 'METADATA', name: '코나 배터리', category: 'battery', manufacturer: '현대', batteryHealth: { cathodeType: 811 } };
    const index = buildSearchIndex([good, odd] as any);
    expect(index.bm25.size).toBe(2);
    expect(index.parts.has('odd')).toBe(true);
  });

  it('skips a record that cannot be indexed instead of failing the whole index', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = { PK: 'PART#broken', SK: 'METADATA', get name(): string { throw new Error('bad record'); } };
    const index = buildSearchIndex([good, broken] as any);
    expect(index.bm25.size).toBe(1);
    expect(index.parts.has('good')).toBe(true);
    expect(index.parts.has('broken')).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
