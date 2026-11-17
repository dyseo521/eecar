# 자동이 진단 평가 (2026-11-09, v3holdout55-candidate)

- 시나리오 40개 × 3회 (eval/agent/scenarios_v3_holdout.json, 구성 candidate), 모델: 기본 라우팅 (복잡한 질문 첫 턴만 Sonnet)
- 통과(원인·조치·오진 없음·필요 도구 모두): pass@1 0%, pass^3 0%
- 항목별: 원인 0%, 조치 0%, 오진 없음 100%, 도구 100%, 증거(대상 함수 조회) 100%
- 실행당 평균: 턴 3.2, 도구 호출 6.3, 입력 토큰 7933, 출력 토큰 3877, 비용 $0.0298, 지연 21.9s
- 총 비용 $3.574, 턴 한도 도달 0회, 오류 0회

| 시나리오 | 출처 | 통과율 |
|---|---|---:|
| v3-03 합성 데이터 생성이 29초를 넘겨 504와 중복 적재 | undefined | 0% |
| v3-04 규정 파일 읽기 거부, 역할 권한은 정상 | undefined | 0% |
| v3-05 Slack webhook이 Slack 쪽에서 무효화됨 | undefined | 0% |
| v3-06 비동기 호출만 한 시간 넘게 지연 | undefined | 0% |
| v3-07 다른 리전 Bedrock 공지, 영향 없음 | undefined | 0% |
| v3-08 트래픽 급증으로 계정 동시성 고갈 | undefined | 0% |
| v3-09 모델 업그레이드 뒤 prefill 요청 거부 | undefined | 0% |
| v3-10 스캐너 요청으로 4XX 증가 | undefined | 0% |
| v3-11 제안 알림 메일 미수신 | undefined | 0% |
| v3-13 Titan 임베딩만 장애 | undefined | 0% |
| v3-14 콜드 스타트로 3초를 넘겨 Slack이 재전송 | undefined | 0% |
| v3-15 알림 함수가 자기 로그를 구독해 폭주 | undefined | 0% |
| v3-16 규정 검사 함수 이름 오타 | undefined | 0% |
| v3-17 캐시 적중 카운터가 핫 키가 되어 500 | undefined | 0% |
| v3-18 느리다는 소문, 지표는 정상 | undefined | 0% |
| v3-19 합성 검사가 멈춰 벡터 알람 발생 | undefined | 0% |
| v3-21 Bedrock Claude 503 폭주 | undefined | 0% |
| v3-22 긴 문서가 임베딩 입력 한도 초과 | undefined | 0% |
| v3-25 메모리와 타임아웃을 함께 줄여 타임아웃 | undefined | 0% |
| v3-28 적재한 배터리가 SOH 필터에서 사라짐 | undefined | 0% |
| v3-29 비동기 이벤트 중복 전달로 메일 중복 | undefined | 0% |
| v3-32 멘션 이벤트만 들어오지 않음 | undefined | 0% |
| v3-34 보존 기간이 지난 과거 504 문의 | undefined | 0% |
| v3-37 프롬프트 변경으로 설명이 무조건 긍정적 | undefined | 0% |
| v3-38 동시 재색인에서 오래된 작업이 새 결과를 덮어씀 | undefined | 0% |
| v3-39 max_tokens 축소로 설명 JSON이 잘림 | undefined | 0% |
| v3-40 max_tokens 상향으로 TPM 예약 초과 | undefined | 0% |
| v3-42 규정 검사 모델 교체로 응답 파싱이 깨짐 | undefined | 0% |
| v3-43 Bedrock 503 두어 분 뒤 자체 회복 | undefined | 0% |
| v3-44 검색어에 심은 지시문이 로그로 유입 | undefined | 0% |
| v3-45 S3 Vectors 버킷 설정이 빈 값으로 배포됨 | undefined | 0% |
| v3-47 카테고리 파서 회귀로 순위 저하 | undefined | 0% |
| v3-48 개발자 시험 호출로 합성 데이터 오류 로그 | undefined | 0% |
| v3-50 이상 값 한 건이 색인 적재를 막아 검색 전체 500 | undefined | 0% |
| v3-51 환경 변수 KMS 키 교체 후 복호화 거부 | undefined | 0% |
| v3-52 Sonnet 경로만 지연되어 자동이 타임아웃 | undefined | 0% |
| v3-53 임베딩 차원 변경으로 색인과 불일치 | undefined | 0% |
| v3-56 최소 권한 정리로 GSI 조회 거부 | undefined | 0% |
| v3-57 모델 ID에서 추론 프로파일 접두사 제거 | undefined | 0% |
| v3-58 알림 서식 회귀로 Slack이 400 거부 | undefined | 0% |
