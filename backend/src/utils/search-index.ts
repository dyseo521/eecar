/**
 * BM25 검색 색인: 전체 부품 METADATA를 읽어 Lambda 실행 환경 메모리에 둔다.
 *
 * 독립 BM25 검색에는 전체 코퍼스가 필요하다(DECISION_LOG E-23). 부품 수가 적어(2026-11 기준 186개)
 * GSI2 쿼리 한 번이면 읽을 수 있으므로, 별도 검색 엔진 없이 메모리 색인을 쓴다.
 * 재검토 조건: 부품 5,000개 이상이거나 색인 적재 지연(IndexLoadMs) p95가 300ms를 넘으면
 * S3에 직렬화한 색인 또는 외부 검색 엔진으로 옮긴다 (A-23).
 */
import { DynamoDBItem } from './dynamodb.js';
import { listPartMetadata } from './parts.js';
import { searchAttributesOf, searchTextOf } from './search-document.js';
import { SearchAttributes } from './search-attributes.js';
import { Bm25Index } from './search.js';

/** 색인 유지 시간. 새로 등록한 부품은 최대 이 시간 뒤에 BM25에 잡힌다 (벡터 검색에는 즉시 잡힘) */
export const SEARCH_INDEX_TTL_MS = 5 * 60 * 1000;

export interface SearchIndex {
  bm25: Bm25Index;
  parts: Map<string, DynamoDBItem>;
  /** 질의 조건과 비교할 부품 속성 (query-understanding.ts) */
  attributes: Map<string, SearchAttributes>;
  loadedAt: number;
}

let cached: SearchIndex | undefined;

export function partIdOf(item: DynamoDBItem): string {
  return String(item.PK).slice('PART#'.length);
}

export function buildSearchIndex(items: DynamoDBItem[], loadedAt = Date.now()): SearchIndex {
  // 형태가 이상한 레코드 하나 때문에 전체 BM25 색인이 실패하면 안 된다. 그 레코드만 빼고, 건수를 남긴다 (A-41)
  const docs: Array<{ id: string; text: string }> = [];
  const parts = new Map<string, DynamoDBItem>();
  const attributes = new Map<string, ReturnType<typeof searchAttributesOf>>();
  let skipped = 0;
  for (const item of items) {
    try {
      const id = partIdOf(item);
      const text = searchTextOf(item);
      const attrs = searchAttributesOf(item);
      docs.push({ id, text });
      parts.set(id, item);
      attributes.set(id, attrs);
    } catch (error) {
      skipped++;
      console.warn('Skipped part in search index:', { pk: item.PK, reason: (error as Error)?.message });
    }
  }
  if (skipped > 0) console.warn(`Search index skipped ${skipped} of ${items.length} parts`);
  return { bm25: Bm25Index.fromTexts(docs), parts, attributes, loadedAt };
}

/** 캐시된 색인을 돌려주고, 없거나 TTL이 지났으면 다시 읽는다. loaded는 이번 호출에서 새로 읽었는지 */
export async function getSearchIndex(now = Date.now()): Promise<{ index: SearchIndex; loaded: boolean }> {
  if (cached && now - cached.loadedAt < SEARCH_INDEX_TTL_MS) {
    return { index: cached, loaded: false };
  }
  cached = buildSearchIndex(await listPartMetadata(), now);
  return { index: cached, loaded: true };
}

/** 테스트용 */
export function resetSearchIndexCache(): void {
  cached = undefined;
}
