# 검색 평가: vector (v2)

- 날짜: 2026-11-05 / 코드: `42fa856` / 코퍼스 sha256: `5abdfeb1047c`
- 문서 300개, 질의 351개. 정답 기준: 등급 2 이상, nDCG는 등급(0~3) 사용

| 구분 | 질의 수 | nDCG@10 | Recall@10 | MRR@10 | P@5 | 결과 0건 비율 |
|---|---:|---:|---:|---:|---:|---:|
| overall | 351 | 0.686 | 0.711 | 0.748 | 0.385 | 0.000 |
| qtype=keyword | 209 | 0.802 | 0.840 | 0.849 | 0.404 | 0.000 |
| qtype=mixed | 63 | 0.535 | 0.518 | 0.635 | 0.340 | 0.000 |
| qtype=semantic | 79 | 0.501 | 0.523 | 0.572 | 0.372 | 0.000 |
| difficulty=easy | 86 | 0.846 | 0.834 | 0.894 | 0.421 | 0.000 |
| difficulty=hard | 66 | 0.494 | 0.494 | 0.555 | 0.342 | 0.000 |
| difficulty=medium | 199 | 0.681 | 0.730 | 0.749 | 0.384 | 0.000 |
| source=demand-persona | 260 | 0.679 | 0.698 | 0.748 | 0.367 | 0.000 |
| source=v1-generated | 91 | 0.705 | 0.748 | 0.747 | 0.437 | 0.000 |
| segment=A-ess | 57 | 0.560 | 0.547 | 0.601 | 0.337 | 0.000 |
| segment=B-small-reuse | 23 | 0.563 | 0.500 | 0.687 | 0.435 | 0.000 |
| segment=C-recycling | 34 | 0.582 | 0.514 | 0.671 | 0.465 | 0.000 |
| segment=D-collision | 57 | 0.767 | 0.956 | 0.842 | 0.203 | 0.000 |
| segment=E-electronics | 52 | 0.774 | 0.960 | 0.838 | 0.254 | 0.000 |
| segment=F-conversion-rnd | 18 | 0.563 | 0.526 | 0.659 | 0.400 | 0.000 |
| segment=G-browse | 19 | 0.943 | 0.393 | 0.961 | 0.968 | 0.000 |
| segment=v1 | 91 | 0.705 | 0.748 | 0.747 | 0.437 | 0.000 |
| form=keyword | 75 | 0.773 | 0.761 | 0.799 | 0.451 | 0.000 |
| form=phrase | 94 | 0.676 | 0.738 | 0.771 | 0.338 | 0.000 |
| form=sentence | 91 | 0.606 | 0.606 | 0.682 | 0.328 | 0.000 |
| form=v1 | 91 | 0.705 | 0.748 | 0.747 | 0.437 | 0.000 |

## nDCG@10 = 0 인 질의 (15개)

- `d004` [semantic/hard] 인산철 배터리 팩 ESS용 → 상위 5: bat-053, bat-044, bat-063, bat-043, bat-050
- `d015` [keyword/easy] 삼성SDI 배터리 팩 재사용 → 상위 5: bat-070, bat-052, bat-033, bat-010, bat-013
- `d016` [semantic/hard] e-GMP 플랫폼 배터리 팩 중고로 구할 수 있나요? → 상위 5: bat-045, bat-033, bat-070, bat-069, bat-065
- `d041` [semantic/hard] NCM 말고 인산철 배터리로 ESS용 찾습니다 → 상위 5: bat-015, bat-014, bat-008, bat-068, bat-003
- `d052` [keyword/medium] LG에너지솔루션 셀이 들어간 배터리 위주로 보고 싶어요. → 상위 5: bat-026, bat-041, bat-020, bat-008, bat-003
- `d086` [keyword/easy] LFP 폐배터리 처리할 물량을 찾고 있어요. → 상위 5: bat-036, bat-020, bat-041, frm-023, elc-020
- `d096` [keyword/medium] 핫스탬핑 강판 스크랩 나오는 부품 있나요? → 상위 5: frm-005, int-009, int-006, frm-013, int-010
- `d118` [keyword/medium] 코나 일렉트릭 앞문 중고 → 상위 5: mot-036, frm-018, pnl-015, bat-055, bat-007
- `d124` [semantic/medium] 리프 2세대 문짝 → 상위 5: pnl-011, elc-024, chg-016, int-002, elc-008
- `d224` [semantic/hard] 컨버전용 테슬라 드라이브 유닛 → 상위 5: bat-019, bat-018, bat-014, chg-020, bat-015
- `d239` [semantic/medium] 탄소섬유 차체 연구 샘플 → 상위 5: pnl-026, pnl-016, pnl-030, pnl-009, pnl-027
- `q014` [semantic/hard] 리튬인산철 배터리 팩 → 상위 5: bat-022, bat-060, bat-036, bat-029, bat-064
- `q015` [keyword/medium] NCA 양극재 배터리 → 상위 5: bat-006, bat-029, bat-060, bat-007, bat-052
- `q073` [semantic/medium] 탄소섬유 차체 구조 → 상위 5: frm-019, pnl-026, frm-017, pnl-030, pnl-016
- `q088` [semantic/medium] 차음 접합유리 → 상위 5: pnl-016, dor-019, dor-012, pnl-026, pnl-015
