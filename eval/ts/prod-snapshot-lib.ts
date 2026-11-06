/**
 * 운영 스냅숏 공용 함수: 스냅숏 레코드를 검색 Lambda와 같은 METADATA 형태로 바꾼다.
 * searchText·searchAttributes를 현재 코드로 다시 만들어, 운영 재색인 결과와 같은 상태를 재현한다.
 */
import { createHash } from 'crypto';
import {
  buildEmbeddingText,
  buildSearchText,
  SEARCH_DOCUMENT_VERSION,
} from '../../backend/src/utils/search-document.js';
import { extractSearchAttributes } from '../../backend/src/utils/search-attributes.js';

export function toIndexedItem(record: Record<string, any>): Record<string, any> {
  return {
    ...record,
    PK: `PART#${record.partId}`,
    SK: 'METADATA',
    searchText: buildSearchText(record),
    searchAttributes: extractSearchAttributes(record),
    searchDocVersion: SEARCH_DOCUMENT_VERSION,
  };
}

export function embeddingTextSha256(records: Array<Record<string, any>>): string {
  const hash = createHash('sha256');
  for (const r of records) hash.update(`${r.partId}\n${buildEmbeddingText(r)}\n`);
  return hash.digest('hex');
}
