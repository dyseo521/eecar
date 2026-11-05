# 검색 평가: prod-hybrid (v2)

- 날짜: 2026-11-05 / 코드: `d88e27c` / 코퍼스 sha256: `5abdfeb1047c`
- 문서 300개, 질의 351개. 정답 기준: 등급 2 이상, nDCG는 등급(0~3) 사용

| 구분 | 질의 수 | nDCG@10 | Recall@10 | MRR@10 | P@5 | 결과 0건 비율 |
|---|---:|---:|---:|---:|---:|---:|
| overall | 351 | 0.696 | 0.707 | 0.765 | 0.424 | 0.000 |
| qtype=keyword | 209 | 0.784 | 0.829 | 0.812 | 0.436 | 0.000 |
| qtype=mixed | 63 | 0.590 | 0.541 | 0.713 | 0.394 | 0.000 |
| qtype=semantic | 79 | 0.547 | 0.519 | 0.681 | 0.418 | 0.000 |
| difficulty=easy | 86 | 0.845 | 0.852 | 0.858 | 0.472 | 0.000 |
| difficulty=hard | 66 | 0.509 | 0.449 | 0.635 | 0.351 | 0.000 |
| difficulty=medium | 199 | 0.694 | 0.731 | 0.768 | 0.428 | 0.000 |
| source=demand-persona | 260 | 0.659 | 0.674 | 0.717 | 0.384 | 0.000 |
| source=v1-generated | 91 | 0.801 | 0.804 | 0.902 | 0.541 | 0.000 |
| segment=A-ess | 57 | 0.584 | 0.565 | 0.684 | 0.383 | 0.000 |
| segment=B-small-reuse | 23 | 0.545 | 0.501 | 0.644 | 0.444 | 0.000 |
| segment=C-recycling | 34 | 0.617 | 0.489 | 0.743 | 0.571 | 0.000 |
| segment=D-collision | 57 | 0.699 | 0.903 | 0.681 | 0.193 | 0.000 |
| segment=E-electronics | 52 | 0.699 | 0.896 | 0.717 | 0.219 | 0.000 |
| segment=F-conversion-rnd | 18 | 0.620 | 0.529 | 0.747 | 0.478 | 0.000 |
| segment=G-browse | 19 | 0.906 | 0.378 | 0.939 | 0.916 | 0.000 |
| segment=v1 | 91 | 0.801 | 0.804 | 0.902 | 0.541 | 0.000 |
| form=keyword | 75 | 0.742 | 0.696 | 0.776 | 0.435 | 0.000 |
| form=phrase | 94 | 0.677 | 0.743 | 0.752 | 0.360 | 0.000 |
| form=sentence | 91 | 0.572 | 0.584 | 0.632 | 0.367 | 0.000 |
| form=v1 | 91 | 0.801 | 0.804 | 0.902 | 0.541 | 0.000 |

## nDCG@10 = 0 인 질의 (15개)

- `d016` [semantic/hard] e-GMP 플랫폼 배터리 팩 중고로 구할 수 있나요? → 상위 5: bat-013, bat-045, bat-070, bat-069, bat-030
- `d041` [semantic/hard] NCM 말고 인산철 배터리로 ESS용 찾습니다 → 상위 5: bat-031, bat-050, bat-001, bat-069, bat-054
- `d075` [semantic/medium] 전동킥보드에 쓸 중고 배터리 찾아요. → 상위 5: bat-028, bat-060, bat-015, bat-045, bat-014
- `d082` [mixed/medium] 재활용용으로 SOH 60% 미만 배터리를 모으고 있습니다. → 상위 5: bat-040, bat-064, bat-031, bat-070, bat-055
- `d096` [keyword/medium] 핫스탬핑 강판 스크랩 나오는 부품 있나요? → 상위 5: int-009, int-010, int-006, int-007, frm-005
- `d113` [keyword/hard] 볼트 PHEV 폐배터리 → 상위 5: frm-023, frm-004, inv-015, dor-010, mot-018
- `d118` [keyword/medium] 코나 일렉트릭 앞문 중고 → 상위 5: mot-036, bat-055, bat-007, bat-006, chg-004
- `d124` [semantic/medium] 리프 2세대 문짝 → 상위 5: pnl-011, int-002, chg-016, elc-024, bat-022
- `d131` [semantic/hard] 볼트 EV 휀다 → 상위 5: chg-010, mot-017, win-010, mot-031, bat-040
- `d173` [semantic/hard] EV6 ICCU 고장 충전 안됨 중고 있나요 → 상위 5: pnl-027, frm-009, mot-004, elc-013, inv-002
- `d196` [keyword/medium] 주행 중 출력 제한 경고가 떠서 인버터 교체를 고려 중입니다. 코나 일렉트릭용 중고 인버터 있을까요? → 상위 5: inv-031, inv-017, inv-025, inv-005, inv-014
- `d224` [semantic/hard] 컨버전용 테슬라 드라이브 유닛 → 상위 5: chg-014, chg-022, inv-025, inv-031, inv-008
- `d239` [semantic/medium] 탄소섬유 차체 연구 샘플 → 상위 5: frm-019, pnl-026, pnl-016, pnl-009, pnl-008
- `q014` [semantic/hard] 리튬인산철 배터리 팩 → 상위 5: bat-060, bat-036, bat-007, bat-028, bat-005
- `q036` [mixed/hard] 200kW 이상 고출력 구동모터 → 상위 5: mot-020, mot-012, mot-006, mot-037, mot-005
