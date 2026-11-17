# 자동이 진단 평가 (2026-11-06, v3dev-candidate)

- 시나리오 20개 × 3회 (eval/agent/scenarios_v3_dev.json, 구성 candidate), 모델: 기본 라우팅 (복잡한 질문 첫 턴만 Sonnet)
- 통과(원인·조치·오진 없음·필요 도구 모두): pass@1 0%, pass^3 0%
- 항목별: 원인 0%, 조치 0%, 오진 없음 100%, 도구 100%, 증거(대상 함수 조회) 100%
- 실행당 평균: 턴 2.7, 도구 호출 4.6, 입력 토큰 30262, 출력 토큰 1142, 비용 $0.0360, 지연 8.5s
- 총 비용 $2.158, 턴 한도 도달 0회, 오류 0회

| 시나리오 | 출처 | 통과율 |
|---|---|---:|
| v3-01 설명에 다른 언어 문자가 섞인다는 제보 | undefined | 0% |
| v3-02 호출 주체를 알 수 없는 Bedrock 사용량 급증 | undefined | 0% |
| v3-12 설명이 느려졌다는 제보, 공지 없음 | undefined | 0% |
| v3-20 Slack 장애로 알림 지연 | undefined | 0% |
| v3-23 재질 검색에 신규 부품이 잡히지 않음 | undefined | 0% |
| v3-24 드물게 쓰는 함수의 Legacy 모델 접근 상실 | undefined | 0% |
| v3-26 캐시 키에서 필터가 빠져 결과 고정 | undefined | 0% |
| v3-27 프론트만 먼저 배포된 것으로 보이는 설명 실패 | undefined | 0% |
| v3-30 SSM 파라미터 이름 정리로 webhook 조회 실패 | undefined | 0% |
| v3-31 배포 뒤 전체 점검, 이상 없음 | undefined | 0% |
| v3-33 색인 캐시 상수 회귀로 매 요청 재적재 | undefined | 0% |
| v3-35 서울 리전 DynamoDB 엔드포인트 장애 | undefined | 0% |
| v3-36 정책 재적용 직후 일시적 AccessDenied | undefined | 0% |
| v3-41 문서 버전을 올리고 재색인을 하지 않음 | undefined | 0% |
| v3-46 타입 패키지를 런타임 import | undefined | 0% |
| v3-49 배포 직후 콜드 스타트로 지연 스파이크 | undefined | 0% |
| v3-54 대량 적재로 GSI2 핫 파티션 역압 | undefined | 0% |
| v3-55 핫픽스 함수만 배포해 레이어와 어긋남 | undefined | 0% |
| v3-59 새 도메인 프론트에서만 API 실패 | undefined | 0% |
| v3-60 대량 적재 뒤 색인 재적재에서 메모리 초과 | undefined | 0% |
