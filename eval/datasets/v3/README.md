# 데이터셋 v3: 블라인드 홀드아웃 질의

v2 test 분할을 두 번 쓴 뒤(결정 기록 E-24), 새 기법을 확인하려고 만든 홀드아웃이다. **구성 선택에는 쓰지 않는다.** 다른 데이터셋의 dev에서 고르고 결정 기록에 사전 등록한 구성만 여기서 확인한다(E-25, E-26).

## 작성 방식

- 질의 160개(`source_queries.jsonl`)는 이 세션의 별도 에이전트가 썼다.
- 작성 중 읽은 파일은 다음뿐이다: v2의 [DEMAND_RESEARCH.md](../v2/DEMAND_RESEARCH.md)(세그먼트·형태 비율), 판정 규칙(`relevance.py`), 차종 표(`vehicles.py`), 코퍼스 생성기(`corpus.py`), 코퍼스(`corpus.jsonl`).
- 다음은 보지 않았다: 기존 질의(v1·v2 queries·qrels), 검색 코드(`backend/src`), 조건 추출 규칙, 평가 리포트, 결정 기록.
- 검증 조건:
  - 모든 질의에 등급 3 문서가 있다.
  - 정답 수는 40개 이하다(G-browse 제외).
  - 판정 키는 `MATCHERS`의 것만 쓴다.

## 구성

| 세그먼트 | 질의 수 |
|---|---:|
| A-ess | 35 |
| B-small-reuse | 14 |
| C-recycling | 21 |
| D-collision | 35 |
| E-electronics | 32 |
| F-conversion-rnd | 11 |
| G-browse | 12 |

- 형태: 문장 35%, 구 36%, 키워드 29%.
- 수치·거래 조건이 있는 질의는 38%다.
- 카탈로그로 표현할 수 없는 요청(보증, 위치, 배송 등)이 섞인 질의는 11%다.
- 오타(밧데리, 휀다)와 증상만 말하는 질의도 들어 있다.
- 코퍼스는 v2와 같다(sha256 `5abdfeb1…`).

## 생성

```bash
uv run python -m eecar_eval.build_v3
npx tsx eval/ts/build-embeddings.ts --dataset eval/datasets/v3 --reuse-docs-from eval/datasets/v2   # 저장소 루트에서
npx tsx eval/ts/export-gate-embeddings.ts --dataset eval/datasets/v3                              # CI 게이트용 묶음
```

## 한계

- 코퍼스에 범퍼·미러·램프가 없어 사고 수리 질의는 후드·펜더·도어·유리 위주다.
- 정답이 하나뿐인 질의가 61개다. 차종마다 같은 부품이 1~2개뿐이기 때문이다.
- 작성자가 사람이 아니라 언어 모델이다. 실제 사용자 질의의 분포와는 다를 수 있다.
