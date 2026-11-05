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
