/**
 * 합성 검사 정의 (DECISION_LOG A-39). eval/prod/canary.json과 같아야 한다.
 * 수동 실행(GitHub Actions)은 JSON을, 일정 실행(Lambda)은 이 값을 쓴다. 두 값은 테스트로 맞춘다.
 */
export interface CanaryCheck {
  id: string;
  query: string;
  top: number;
  category?: string;
  noMismatch?: string[];
}

export interface CanarySpec {
  diagnostics: { minVectorCandidates: number; minBm25Candidates: number; minIndexSize: number };
  maxLatencyMs: number;
  checks: CanaryCheck[];
  explain: { query: string; parts: number };
}

export const CANARY_SPEC: CanarySpec = {
  diagnostics: { minVectorCandidates: 50, minBm25Candidates: 1, minIndexSize: 100 },
  maxLatencyMs: 10000,
  checks: [
    { id: 'c1', query: '아이오닉5 배터리 팩', top: 3, category: 'battery', noMismatch: ['차종'] },
    { id: 'c2', query: '테슬라 모델3 모터', top: 5, category: 'motor' },
    { id: 'c3', query: 'ESS용 60kWh 이상 배터리', top: 5, category: 'battery', noMismatch: ['용량'] },
    { id: 'c4', query: '500만원 이하 배터리', top: 5, category: 'battery', noMismatch: ['가격'] },
    { id: 'c5', query: '코나 인버터', top: 1, category: 'inverter', noMismatch: ['차종'] },
  ],
  explain: { query: '아이오닉5 배터리 팩', parts: 2 },
};
