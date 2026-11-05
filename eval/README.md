# EECAR 검색 평가 하네스

검색 변경이 품질을 올렸는지, 떨어뜨렸는지를 **같은 데이터, 같은 절차**로 재현해서 측정한다.

이 하네스를 만든 이유는 기존 평가가 실제 검색을 측정하지 못하고 있었기 때문이다.
- `backend/evaluation`의 골든셋 ID(`battery-007` 등)는 프로덕션 ID(UUID)와 달랐다. 그래서 프로덕션에 돌리면 모든 지표가 0이었다.
- 로컬 서버는 임베딩 없이 문자열 매칭만 하는 mock이라, 여기서 나온 점수는 RAG 품질과 무관했다.

이 하네스는 고정된 ID의 코퍼스를 직접 들고 다니고, 프로덕션 검색 코드(`backend/src/utils`)를 그대로 호출한다.

## 구성

| 경로 | 내용 |
|---|---|
| `datasets/v1/` | 부품 코퍼스 300개, 질의 91개, 정답 등급(qrels), 해시가 담긴 manifest |
| `eecar_eval/vehicles.py` | 1세대 전기차 21종 제원 표 (공개 자료 기반 근사치) |
| `eecar_eval/corpus.py`, `queries.py`, `relevance.py`, `build.py` | 데이터셋 생성기 (시드 고정, 결정적) |
| `ts/search-cli.ts` | 프로덕션 검색 함수를 호출해 질의별 순위를 출력 |
| `ts/build-embeddings.ts` | 프로덕션 `preparePartText` + Titan으로 임베딩 캐시 생성 (AWS 필요) |
| `eecar_eval/run.py`, `metrics.py` | 지표 계산과 리포트 생성 |
| `reports/` | 실행 결과 (JSON + Markdown) |

## 실행

저장소 루트에서 `npm ci`를 먼저 실행한다. `tsx`가 필요하다.

```bash
cd eval
uv run pytest -q                                  # 지표·라벨·데이터셋 테스트
uv run python -m eecar_eval.build                 # 데이터셋 재생성 (생성기를 바꿨을 때만)
uv run python -m eecar_eval.run --system bm25     # 오프라인 BM25 평가 → reports/

# AWS 자격 증명이 있을 때 (저장소 루트에서)
npx tsx eval/ts/build-embeddings.ts --dataset eval/datasets/v1
# 다시 eval/ 에서
uv run python -m eecar_eval.run --system vector
uv run python -m eecar_eval.run --system prod-hybrid
uv run python -m eecar_eval.compare reports/<A>.json reports/<B>.json   # 질의별 쌍체 비교
uv run python -m eecar_eval.experiment                                   # 기법·비율 실험 그리드
```

Windows 콘솔에서 한글이 깨지면 `PYTHONIOENCODING=utf-8`을 설정한다.

## 데이터셋 v1 설계

**코퍼스**
- 차종 21종 × 11개 카테고리로 부품 300개를 만든다.
- 차종별 배터리 옵션, 모터, 인버터는 최소 1개씩 들어가도록 보장한다.
- 부품마다 검색 시스템이 보는 `part`(shared `Part` 형태)와, 정답 판정에만 쓰는 `attrs`(차종, 양극재, SOH, 출력, 합금 등)를 따로 둔다.

**질의 91개**

| 유형 | 개수 |
|---|---:|
| keyword | 53 |
| mixed | 17 |
| semantic | 21 |

일부러 넣은 어려운 경우는 다음과 같다.
- 표기 변형: 아이오닉5 / 아이오닉 5 / IONIQ 5
- 조사가 붙은 형태: "니로EV 배터리를"
- 동음이의어: 볼트 EV(Bolt) / 볼트 PHEV(Volt)
- 문서에 없는 동의어: 리튬인산철 = LFP, 차데모 = CHAdeMO
- 수치 조건: SOH 90% 이상, 200kW 이상

**정답 판정**

질의마다 `must`·`should` 조건을 두고, `attrs`에 규칙을 적용해 등급을 계산한다.
- 3: 모든 조건 만족
- 2: `must`만 만족
- 1: 같은 카테고리이고 일부 조건 만족
- 0: 그 외

LLM으로 판정하지 않는 이유는 코퍼스를 LLM과 함께 만들었기 때문이다. 판정까지 LLM에 맡기면 LLM 기반 검색에 유리하게 치우칠 수 있다.

**검증** (`tests/test_dataset.py`)
- 재현성
- 커밋된 파일과 생성기 출력이 일치하는지(해시 비교)
- 질의마다 등급 3 문서가 1개 이상 있는지
- 정답 수 상한 25개

## 지표

정답 기준은 등급 2 이상이다.

| 지표 | 설명 |
|---|---|
| nDCG@10 | 등급(0~3)을 그대로 이득으로 쓰는 graded 지표. 주 지표 |
| Recall@10 | 상위 10개 안에 든 정답 비율 |
| MRR@10 | 첫 정답의 순위 역수 |
| P@5 | 상위 5개 중 정답 비율 |
| 결과 0건 비율 | 결과가 하나도 없는 질의의 비율 |

## 시스템 (`--system`)

| 이름 | 설명 | 필요 조건 |
|---|---|---|
| `bm25` | 프로덕션 BM25(토크나이저, 점수식, `preparePartForBM25`)를 **전체 코퍼스**에 적용. 현재 프로덕션에는 없는 구성이고, 키워드 검색 단독의 상한을 보는 ablation | 없음 |
| `vector` | 캐시된 Titan 임베딩으로 전체 코퍼스 코사인 검색 | 임베딩 캐시 |
| `prod-hybrid` | vector-search Lambda 4~8단계를 재현. 벡터 상위 20개 → 그 안에서만 BM25 → α=0.7 결합 → 상위 10개 | 임베딩 캐시 |

## 회귀 게이트 (CI)

`test-pipeline`의 `Search Eval` 작업이 PR과 push마다 다음 두 가지를 실행한다.

1. 하네스 테스트
2. `python -m eecar_eval.gate --system bm25`

게이트는 `baselines/v1-bm25.json`의 유형·난이도별 nDCG@10, Recall@10, MRR@10과 비교해 0.01 넘게 떨어지면 실패한다. 개선은 실패로 보지 않고 출력만 한다. 의도한 변경이라면 `--update`로 기준값을 갱신하고 함께 커밋한다. 그러면 지표 변화가 PR diff에 드러난다.

게이트 검증 (2026-11-05)
- 프로덕션 BM25에 회귀를 넣어 봤다(질의 토큰을 첫 단어만 사용). 게이트가 실패했다(exit 1).
- 원래 코드로 되돌리자 통과했다.

## 결과 (2026-11-05)

### 기준값 (질의 91개 전체)

| 시스템 | nDCG@10 | Recall@10 | MRR@10 | hard nDCG@10 | 리포트 |
|---|---:|---:|---:|---:|---|
| bm25 (전체 코퍼스) | 0.758 | 0.785 | 0.814 | 0.491 | [보기](reports/2026-11-05-v1-bm25.md) |
| vector (Titan v2, 정확한 코사인) | 0.733 | 0.762 | 0.797 | 0.460 | [보기](reports/2026-11-05-v1-vector.md) |
| **prod-hybrid (현재 프로덕션 재현)** | **0.801** | 0.804 | 0.902 | 0.520 | [보기](reports/2026-11-05-v1-prod-hybrid.md) |

### 쌍체 비교 (nDCG@10)

| 비교 | Δ | 95% CI | p | 리포트 |
|---|---:|---|---:|---|
| prod-hybrid vs vector | +0.068 | [+0.032, +0.108] | <0.001 | [보기](reports/compare-v1-prod-hybrid-vs-vector-ndcg10.md) |
| prod-hybrid vs bm25 | +0.043 | [+0.001, +0.088] | 0.055 | [보기](reports/compare-v1-prod-hybrid-vs-bm25-ndcg10.md) |
| bm25 vs vector | +0.025 | [−0.042, +0.090] | 0.46 | [보기](reports/compare-v1-bm25-vs-vector-ndcg10.md) |

현재 구조에서 BM25 재정렬은 벡터 단독보다 분명히 낫다. BM25 단독보다 나은지는 경계선이다.

### 기법 실험 (구성 46개, dev에서 선택하고 test에서 확인)

`uv run python -m eecar_eval.experiment` → [reports/2026-11-05-v1-experiments.md](reports/2026-11-05-v1-experiments.md)

| 계열 | 내용 |
|---|---|
| A | 프로덕션 구조에서 α를 0~1 범위로 스윕 |
| B | 후보 수 20 / 50 / 100 |
| C | 독립 검색 + 볼록 결합, α 스윕 |
| D | RRF, k = 10 / 30 / 60 / 100 |
| E | 토크나이저: 공백 / 문자 bigram / 공백+bigram |
| F | IDF 제거 |

test 44개에서 현재 프로덕션(`prod-ws-a0.7-c20`, test 0.772)과 비교한 결과다.

| 후보 (dev 기준으로 선택) | Δ | 95% CI | p |
|---|---:|---|---:|
| 후보 풀 20 → 100 (파라미터 1개 변경) | +0.036 | [−0.000, +0.071] | 0.060 |
| 독립 검색 + 볼록 결합 α=0.5 + IDF 제거 | +0.034 | [−0.002, +0.068] | 0.070 |
| RRF k=30 | −0.012 | [−0.057, +0.029] | 0.59 |

결론은 이렇다. 두 개선 후보가 유망하지만, 신뢰구간이 0에 걸쳐 있어 **v1으로는 확정할 수 없다**. 그래서 프로덕션 변경은 보류하고, 질의를 약 350개로 늘린 v2에서 다시 확인한다. 이 수치가 나온 계산 과정은 [결정 기록 E-05, E-17](../docs/DECISION_LOG.md)에 있다. 구성을 고르는 기준, 허용치, 표본 수의 근거도 모두 결정 기록에 있다.

관찰한 점
- **차종 표기 변형에 약하다.** "아이오닉 일렉트릭 IGBT 인버터"(nDCG 0)는 같은 차종이 "IONIQ Electric"·"아이오닉EV"로 적힌 문서를 찾지 못했다.
- **수치·전압 조건은 텍스트 매칭으로 풀리지 않는다.** "800V 고전압 배터리 팩"은 배터리 문서에 "정격전압 653V"로만 적혀 있어, "800V"가 들어간 인버터가 대신 올라온다.
- **IDF가 이 도메인에서 역효과를 낸다.** IDF를 끄면 keyword 질의 nDCG@10이 0.81에서 0.86으로 오른다. "배터리"처럼 자주 나오지만 의도의 핵심인 카테고리 단어가 낮은 가중치를 받고, 차종명만 맞는 다른 카테고리 부품(같은 차종의 도어 등)이 위로 올라오기 때문이다. 코퍼스의 카테고리 분포에 따라 달라질 수 있는 결과라서 필드 가중치·카테고리 인식 실험으로 확인한다.

## 데이터셋 v2: 실제 수요 근거 질의 (2026-11-05)

**구성**
- `datasets/v2`의 코퍼스는 v1과 같은 부품 300개다.
- 질의는 351개로, 수요 근거 질의 260개와 v1 질의 91개다.
- 세그먼트 배분과 질의 형태 비율은 [DEMAND_RESEARCH.md](datasets/v2/DEMAND_RESEARCH.md)(논문·정책·산업 자료 42건)를 근거로 정했다.

**실행**

```bash
uv run python -m eecar_eval.build_v2
npx tsx eval/ts/build-embeddings.ts --dataset eval/datasets/v2 --reuse-docs-from eval/datasets/v1   # 저장소 루트에서
uv run python -m eecar_eval.run --dataset v2 --system prod-hybrid
uv run python -m eecar_eval.experiment --dataset v2
```

**기준값** (수요 근거 질의 260개, nDCG@10)

| | BM25 | 벡터 | 현재 하이브리드 |
|---|---:|---:|---:|
| 전체 | 0.542 | **0.672** | 0.659 |

v1과는 결론이 반대다. 문서에서 생성한 v1 질의에서는 BM25가 벡터보다 높았지만, 실제 수요에 가까운 질의에서는 벡터가 가장 높다. 현재 구조는 벡터 후보 20개를 BM25로 다시 정렬하는데, 이 재정렬이 문장형 질의(벡터 단독 0.610 → 하이브리드 0.572)와 전장 부품 질의(0.772 → 0.699)에서 오히려 점수를 깎는다.

**기법 실험** (test 174개, 현재 프로덕션 0.700 대비): [보고서](reports/2026-11-05-v2-experiments.md)

| 구성 | Δ | 95% CI |
|---|---:|---|
| **독립 검색 + 볼록 결합 α=0.8** | **+0.035** | [+0.017, +0.054] (p<0.001) |
| 현재 구조에서 α만 0.9로 변경 | +0.025 | [+0.011, +0.040] |
| 후보 풀 50개 (v1에서 유망했던 구성) | +0.004 | [-0.012, +0.021], 재현되지 않음 |
| 독립 검색 + RRF k=10 | -0.002 | [-0.021, +0.016], 이득 없음 |

근거는 [결정 기록 E-20~E-22](../docs/DECISION_LOG.md)에 있다.

## 실패 원인 분석과 검색 구조 변경 (2026-11-05, fusion-v2)

v2에서 피할 수 있었던 오답을 원인별로 나눴습니다. 결합 방식보다 **검색 문서 데이터**가 더 큰 원인이었습니다([결정 기록 E-23](../docs/DECISION_LOG.md)).

- **결합 비중**: 명목 70:30인 결합에서 BM25가 실제로는 순위의 약 72%를 결정했다. 벡터 점수를 정규화하지 않았기 때문이다.
- **문서 내용**: 검색 문서에 가격·연식·상태가 없었고, 필드 이름이 어긋나 충방전 횟수가 빠졌다. 사실과 다른 고정 키워드(SiC 인버터에 IGBT)도 들어 있었다.
- **차종 표기**: 운영 부품의 89%가 차종을 영문으로만 적어, 한글 질의가 BM25에서 맞지 않았다.

| (v2 test 174개, nDCG@10) | 이전 | 변경 후 |
|---|---:|---:|
| 프로덕션 하이브리드 | 0.700 | **0.775** (+0.075 [+0.047, +0.105]) |

문서 정의를 바꿔 문서 임베딩을 다시 만들 때는 다음을 실행합니다.

```bash
npx tsx eval/ts/build-embeddings.ts --dataset eval/datasets/v2 --doc-text v2-notrade   # 현재 프로덕션 임베딩 텍스트
uv run python -m eecar_eval.run --dataset v2 --system prod-hybrid --tag <이름>           # --tag: 같은 날 리포트 덮어쓰기 방지
uv run python -m eecar_eval.run --dataset v2 --system legacy-hybrid                     # 이전 구조 재현
uv run python -m eecar_eval.experiment --dataset v2 --grid root-cause
```

- 이전 구조를 다시 실행한 값은 기존 리포트와 정확히 일치한다(v1 0.8012, v2 0.6959).
- v2 test 분할은 두 번 썼다(E-24). 다음 기법 선택 전에는 새 질의 묶음으로 test를 바꾼다.

## 질의 이해와 블라인드 홀드아웃 v3 (2026-11-06, rank-v3)

- **남은 원인**: 문서와 결합을 고친 뒤 남은 오답의 38%는 "60kWh 이상" 같은 수치 조건, 24%는 카테고리 오답이었습니다.
- **변경 1, 질의 조건 감점**: 질의에서 카테고리·수치 조건을 뽑아 부품 속성과 비교하고, 위반하면 감점합니다.
  - 부품 속성은 정답 attrs가 아니라 프로덕션 추출 함수로 문서에서 뽑은 값입니다.
- **변경 2, 토크나이저**: BM25는 한글을 글자 2-gram으로 나눕니다("배터리팩" = "배터리 팩").
- **선택과 확인 절차**:
  1. v2 dev에서 구성을 고르고, v3에서 볼 구성과 채택 기준을 [결정 기록 E-25](../docs/DECISION_LOG.md)에 먼저 커밋했습니다.
  2. v3는 규칙과 기존 질의를 보지 않은 별도 에이전트가 쓴 질의 160개입니다([datasets/v3/README.md](datasets/v3/README.md)).

| v3 홀드아웃 160개, nDCG@10 | 값 |
|---|---:|
| 이전 프로덕션 (v1.6.0) | 0.789 |
| **사전 등록 구성** | **0.890** (+0.101 [+0.062, +0.142]) |

- 카테고리 조건만으로는 v3에서 효과가 재현되지 않았습니다(+0.006). 이득은 주로 수치 조건에서 나옵니다(E-26).
- **CI 게이트**: 운영 순위 로직(`prod-hybrid`)도 v2·v3에서 검사합니다. 커밋된 `gate-embeddings.json.gz`를 쓰므로 AWS가 필요 없습니다.
  - BM25 단독 게이트는 운영 구조와 어긋나 있었습니다. 이번 변경에서 BM25 단독은 일부 그룹이 떨어졌지만 운영 파이프라인은 모든 그룹이 올랐습니다(A-29).

```bash
uv run python -m eecar_eval.experiment --dataset v2 --grid query-understanding            # 선택 (dev)
uv run python -m eecar_eval.experiment --dataset v3 --grid query-understanding --holdout  # 사전 등록 구성 확인
npx tsx eval/ts/export-gate-embeddings.ts --dataset eval/datasets/v3                     # 문서 정의를 바꾼 뒤 게이트 묶음 갱신
```

## 한계 (해석할 때 주의)

- **코퍼스와 라벨이 합성 데이터다.**
  - 제원은 근사치다.
  - 의미상 관련이 있어도 속성으로 표현되지 않은 문서는 0점이 된다.
  - 질의와 문서 설명을 같은 작성자(생성기)가 만들어 어휘가 겹친다. 그래서 "semantic" 질의도 BM25로 꽤 풀린다(BM25 semantic nDCG 0.729).
  - v2에서는 독립적으로 쓴 질의와 pooling 기반의 사람 판정으로 보완한다.
- **아직 측정하지 않는 것**
  - `prod-hybrid`는 쿼리 확장(Claude), 결과 캐시, 필터, 설명 생성을 제외한다. 쿼리 확장은 캐시된 확장 결과로 따로 실험한다.
  - S3 Vectors는 근사 최근접 검색인데, 오프라인은 정확한 코사인 검색이다. 차이는 staging 온라인 평가로 확인한다.
  - 지연 시간과 비용은 오프라인에서 재지 않는다. staging 온라인 평가에서 측정한다.
