# 자동이 진단 평가 (2026-11-06, holdout2-config)

- 시나리오 30개 × 3회 (eval/agent/holdout_v2_scenarios.json, 구성 current), 모델: 기본 라우팅 (복잡한 질문 첫 턴만 Sonnet)
- 통과(원인·조치·오진 없음·필요 도구 모두): pass@1 49%, pass^3 30%
- 항목별: 원인 78%, 조치 60%, 오진 없음 100%, 도구 100%, 증거(대상 함수 조회) 99%
- 실행당 평균: 턴 2.4, 도구 호출 3.5, 입력 토큰 15523, 출력 토큰 1109, 비용 $0.0211, 지연 7.7s
- 총 비용 $1.896, 턴 한도 도달 0회, 오류 0회

| 시나리오 | 출처 | 통과율 |
|---|---|---:|
| v2-01 특정 검색어만 검색 실패 | format-based | 100% |
| v2-02 관심 부품 알림 등록 실패 | format-based | 0% |
| v2-03 KNOWLEDGE_BASE_ID 빈 값 | format-based | 33% |
| v2-04 합성 데이터 30개 생성 시 504 | format-based | 100% |
| v2-05 정상 부품에도 규정 위반 알림 | format-based | 0% |
| v2-06 존재하지 않는 결제 함수 문의 | format-based | 67% |
| v2-07 배터리 SOH 검색만 실패 | format-based | 67% |
| v2-08 파트너 연동 후 목록 API 에러 급증 | format-based | 100% |
| v2-09 같은 에러 알림이 계속 쌓임 | format-based | 100% |
| v2-10 알림 등록 첫 요청만 느림 + 경고 로그 | format-based | 33% |
| v2-11 부품 등록 실패 메시지인데 목록엔 등록됨 | format-based | 0% |
| v2-12 리팩터링 배포 후 제안 API 전체 실패 | format-based | 0% |
| v2-13 일부 고객 문의만 접수 실패 | format-based | 67% |
| v2-14 배포 직후 전체 상태 점검 | format-based | 0% |
| v2-15 규정 위반 알림이 한 건도 없음 | format-based | 0% |
| v2-16 AI 설명이 가끔 전부 기본 문구 | format-based | 100% |
| v2-17 같은 에러인데 알림은 가끔만 옴 | format-based | 100% |
| v2-18 합성 데이터 설명이 전부 템플릿 문장 | format-based | 0% |
| v2-19 배터리 데이터 일괄 적재 후 SOH 검색 실패 | format-based | 100% |
| v2-20 부품 목록에 샘플 데이터만 보임 | format-based | 0% |
| v2-21 막연한 이상 징후 문의 | format-based | 33% |
| v2-22 특정 판매자 등록만 실패, 부품은 중복 생성 | format-based | 100% |
| v2-23 장애 때 슬랙 알림 일부 누락 | format-based | 67% |
| v2-24 TTL 지난 캐시 항목이 테이블에 남아 있음 | format-based | 67% |
| v2-25 재질 검색이 간헐적으로 실패 | format-based | 67% |
| v2-26 새 부품이 특정 검색어로만 안 나옴 | format-based | 100% |
| v2-27 문의 내역이 DB에 없음 | format-based | 0% |
| v2-28 계약 제안 알림 메일 미수신 | format-based | 0% |
| v2-29 유틸 수정 배포 후 부품 등록 전부 실패 | format-based | 67% |
| v2-30 함수 이름 오타 (재질 검색) | format-based | 0% |
