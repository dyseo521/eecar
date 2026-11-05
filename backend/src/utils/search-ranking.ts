/**
 * 검색 순위 계산: 벡터·BM25 결합 → 질의 조건 재정렬. 검색 Lambda와 평가 실행기가 이 함수를 함께 쓴다.
 *
 * 1. 두 검색기의 상위 목록을 각각 정규화해 볼록 결합한다 (fuseRankedLists, E-23)
 * 2. 질의에서 뽑은 카테고리·수치 조건을 위반한 부품을 감점한다 (rerankByConstraints, E-25)
 */
import { CANDIDATES_PER_RETRIEVER, fuseRankedLists, HYBRID_ALPHA, RankedHit, FusedHit, Bm25Index } from './search.js';
import { ConstraintCheck, CONSTRAINT_PENALTY, parseQuery, QueryConstraints, rerankByConstraints } from './query-understanding.js';
import type { SearchAttributes } from './search-attributes.js';

export type RankedResult = FusedHit & { constraints: ConstraintCheck };

export function bm25Candidates(index: Bm25Index, query: string): RankedHit[] {
  return index.search(query, CANDIDATES_PER_RETRIEVER);
}

export function rankCandidates(
  query: string,
  vectorMatches: RankedHit[],
  bm25Matches: RankedHit[],
  attributesOf: (id: string) => SearchAttributes | undefined,
  constraints: QueryConstraints = parseQuery(query)
): RankedResult[] {
  const fused = fuseRankedLists(vectorMatches, bm25Matches, HYBRID_ALPHA);
  return rerankByConstraints(fused, attributesOf, constraints, CONSTRAINT_PENALTY);
}
