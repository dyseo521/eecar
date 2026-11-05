import { useQuery } from '@tanstack/react-query';
import type { SearchExplainResponse } from '@shared/index';
import { getApiUrl } from '../config';

/**
 * 검색 결과의 AI 설명을 나중에 불러온다.
 *
 * 검색 응답은 LLM 설명 없이 먼저 오고(reason = 조건 확인 요약), 설명은 이 요청으로 따로 받는다.
 * 설명이 검색 응답 시간의 83%를 차지했기 때문이다 (DECISION_LOG A-30).
 * 실패해도 검색 결과 표시에는 영향이 없다 (조건 요약이 그대로 남는다).
 */
export function useSearchExplanations(query: string | undefined, partIds: string[]) {
  return useQuery({
    queryKey: ['search-explain', query, partIds],
    queryFn: async () => {
      const response = await fetch(getApiUrl('search/explain'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, partIds }),
      });
      if (!response.ok) {
        throw new Error('설명을 불러오지 못했습니다');
      }
      const body = (await response.json()) as SearchExplainResponse;
      return body.explanations;
    },
    enabled: !!query && partIds.length > 0,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });
}
