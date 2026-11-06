# 자동이 진단 평가 (2026-11-06, shipped)

- 시나리오 20개 × 3회, 모델: 기본 라우팅 (복잡한 질문 첫 턴만 Sonnet)
- 통과(원인·조치·오진 없음·필요 도구 모두): pass@1 88%, pass^3 85%
- 항목별: 원인 97%, 조치 95%, 오진 없음 95%, 도구 100%, 증거(대상 함수 조회) 100%
- 실행당 평균: 턴 2.4, 도구 호출 3.3, 입력 토큰 9001, 출력 토큰 966, 비용 $0.0138, 지연 8.1s
- 총 비용 $0.830, 턴 한도 도달 0회, 오류 0회

| 시나리오 | 출처 | 통과율 |
|---|---|---:|
| s01 퇴역(Legacy) 모델 접근 거부 (C-09 실제 장애) | prod-log | 100% |
| s02 ERROR로 찍힌 Node 버전 경고 (장애 아님) | prod-log | 100% |
| s03 Bedrock 호출 스로틀링 | format-based | 100% |
| s04 Lambda 타임아웃 | format-based | 33% |
| s05 DynamoDB 처리량 초과 | format-based | 100% |
| s06 IAM 권한 부족 | format-based | 100% |
| s07 클라이언트의 잘못된 JSON (서버 문제 아님) | format-based | 100% |
| s08 Lambda Layer 모듈 누락 (배포 불일치) | format-based | 100% |
| s09 SSM 파라미터 없음 | format-based | 100% |
| s10 S3 객체 없음 (벡터 manifest) | format-based | 100% |
| s11 잘못된 모델 ID | format-based | 100% |
| s12 계정 토큰 쿼터 소진 (A-12 경험 기반) | format-based | 0% |
| s13 중복 제거용 조건부 쓰기 실패 (정상 동작) | format-based | 33% |
| s14 정상 상태 (거짓 경보 방지) | format-based | 100% |
| s15 에러 없는 결과 0건 (C-06 유형의 조용한 장애) | format-based | 100% |
| s16 콜드 스타트 지연 | format-based | 100% |
| s17 메모리 부족으로 런타임 종료 | format-based | 100% |
| s18 Slack 3초 제한 초과로 인한 재시도 (C-13 유형) | format-based | 100% |
| s19 존재하지 않는 함수 (지어내기 방지) | format-based | 100% |
| s20 스로틀링과 무관한 경고가 섞인 로그 (주원인 식별) | format-based | 100% |
