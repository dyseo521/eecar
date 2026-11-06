# 자동이 진단 평가

자동이(Slack DevOps 에이전트)가 장애 질문에 **맞는 원인과 조치**를 답하는지 측정한다. 이전에는 에이전트 품질을 잴 방법이 없었다.

## 현재 방식 (시나리오 v3 + 판정 모델)

v3부터 표현 목록 대신 **검증한 판정 모델**로 채점한다(E-33). 표현 목록은 기준 판정과 일치도가 낮아 폐기했다(κ 0.36). 아래 "채점 (결정적 규칙)" 절은 v1·v2의 방식이다.

- **시나리오**: `scenarios_v3.json` 60개. 실제 장애 분포를 따라 구성했다(E-34). `scenarios_v3_dev.json` 20개로 고치고, `scenarios_v3_holdout.json` 40개는 사전 등록 뒤 한 번만 쓴다. **홀드아웃은 내용을 열지 않는다.**
- **판정 모델**: `../ts/agent-judge.ts` (v2.2, Sonnet 4.6). 3회 다수결의 시험용 40건 기준 TPR 81%, TNR 92%, κ 0.74. 통과율과 함께 보정값(Rogan-Gladen)을 보고한다. 한 건마다 저장하고 `--resume`으로 잇는다.
- **보조 지표**: `../ts/agent-structured-score.ts`. 판정 일치, 장애 놓침, 과잉 단정을 모델 없이 계산한다.
- **시계**: 로그는 자체 시각을 그대로 쓰고, 시나리오의 현재는 마지막 로그의 1분 뒤다(`scenarioClock`). 재실행 결과가 같아 판정 모델의 재현 자료와 일치한다.
- **후보 구성** (`--variant candidate`): 조사 도구 + `candidate-system-prompt.txt` + 현재 시각 + 결론 시점 제출 강제. `--free-text`는 제출을 강제하지 않는다.

```bash
# dev: 구성을 고칠 때
node --import tsx --import ./eval/ts/opt-alias.mjs eval/ts/agent-eval.ts --scenarios eval/agent/scenarios_v3_dev.json --runs 3 --variant candidate --tag <이름>
node --import tsx --import ./eval/ts/opt-alias.mjs eval/ts/agent-judge.ts --report eval/reports/<결과>.json --model global.anthropic.claude-sonnet-4-6 --tag <이름>
node --import tsx --import ./eval/ts/opt-alias.mjs eval/ts/agent-structured-score.ts eval/reports/<결과>.json

# 홀드아웃: 사전 등록 커밋 뒤 한 번만. 중단되면 다시 실행하면 이어서 한다
bash eval/agent/run_holdout_v3.sh
```

**토큰 예산을 먼저 계산한다**(A-42). 평가는 운영과 같은 계정 할당량을 쓰고, 일일 한도는 공시되지 않았다(Sonnet 4.6 약 1,000만 토큰에서 관측). 실행 1회: v1.9.1 Haiku 약 1만, 후보 Haiku 약 4.9만. 판정 1건: Sonnet 약 9,200.

## 구성

| 경로 | 내용 |
|---|---|
| `scenarios.json` | dev 시나리오 20개. 2개는 운영 CloudWatch 로그 원문, 18개는 AWS SDK·Lambda 실제 오류 형식의 합성 |
| `holdout_scenarios.json` | 블라인드 홀드아웃 15개. 프롬프트·오케스트레이터·dev 시나리오를 보지 않은 별도 에이전트가 썼다 |
| `baseline-system-prompt.txt` | A-35 수정 전 시스템 프롬프트 (`--variant baseline` 재현용) |
| `holdout_v2_scenarios.json` | 블라인드 홀드아웃 v2 30개 (E-31에서 사전 등록, 한 번 씀). 함수 설정·권한 세계 상태 포함 |
| `dev_h_scenarios.json` | 홀드아웃 v1을 dev로 돌린 것. 설정이 원인인 h02·h09에 세계 상태 추가 |
| `world-default.json` | 운영 함수 12개의 설정·권한 스냅숏 (`eval/ts/export-agent-world.ts`, 비밀값 가림). 시나리오는 다른 부분만 덮어쓴다 |
| `shipped-v1.9.1-system-prompt.txt`, `config-runbook-system-prompt.txt` | 비교용 프롬프트 (v1.9.1, 설정 도구 실험의 런북 포함) |
| `../ts/agent-compare.ts` | 두 결과를 시나리오 단위로 짝지어 비교 (부트스트랩 구간, 범주별 부분집합) |
| `../ts/agent-eval.ts` | 실행기. 에이전트(`orchestrator.runReActAgent`)는 운영 코드 그대로, 모델도 실제로 호출한다 |
| `../reports/*-agent-eval-*.{json,md}` | 실행 결과 |

- 도구는 시나리오의 고정 데이터로 운영 도구와 같은 형태를 돌려준다. `analyze_error`는 실제 Claude 분석을 하되 Bedrock KB와 장기 기억은 비운다.
- 시나리오에는 함정이 섞여 있다: 정상 상태, 의도된 예외, 없는 함수, 주원인과 무관한 경고.

## 채점 (결정적 규칙, v1·v2)

한 실행은 아래를 모두 만족해야 통과다.

- **원인**: 원인 표현 중 하나가 답에 있다.
- **조치**: 조치 표현 중 하나가 있다.
- **오진 없음**: 오진 표현이 없다.
- **도구**: 필요한 도구를 불렀다.
- **증거**: 고정 데이터가 있는 함수를 실제로 조회했다. 엉뚱한 함수를 보고 짐작한 답을 막는다.

LLM 판정을 쓰지 않는 이유는 판정 모델과 피평가 모델이 같은 계열이면 치우칠 수 있고, 판정 자체의 사람 대비 일치도부터 검증해야 하기 때문이다.

채점 규칙을 바꾸면 저장된 **모든** 실행에 다시 적용한다(`--regrade`). 결과를 보고 한쪽만 고치지 않기 위해서다. 보정 이력은 `docs/DECISION_LOG.md` E-29에 있다.

## 실행

Bedrock 자격 증명이 필요하다. 시나리오 20개 × 3회에 약 $0.8가 든다.

```bash
# 저장소 루트에서
node --import tsx --import ./eval/ts/opt-alias.mjs eval/ts/agent-eval.ts --runs 3 --tag <이름>
node --import tsx --import ./eval/ts/opt-alias.mjs eval/ts/agent-eval.ts --scenarios eval/agent/holdout_scenarios.json --tag holdout
node --import tsx --import ./eval/ts/opt-alias.mjs eval/ts/agent-eval.ts --variant baseline --tag baseline   # 수정 전 동작
node --import tsx --import ./eval/ts/opt-alias.mjs eval/ts/agent-eval.ts --variant config --tag config        # 설정·권한 도구 + 런북 (A-38 실험)
npx tsx eval/ts/agent-compare.ts eval/reports/<A>.json eval/reports/<B>.json --exclude config,iam,limit
node --import tsx --import ./eval/ts/opt-alias.mjs eval/ts/agent-eval.ts --regrade eval/reports/<파일>.json   # 다시 채점 (모델 호출 없음)
```

`opt-alias.mjs`는 Lambda 코드의 `/opt/nodejs/utils/*` import를 `backend/src/utils/`로 연결한다.

## 결과 (2026-11-06)

pass@1은 전체 실행 중 통과 비율, pass^3은 3회 모두 통과한 시나리오 비율이다.

| 구성 | dev 20개 pass@1 | dev pass^3 | 홀드아웃 15개 pass@1 |
|---|---:|---:|---:|
| 수정 전 | 72% | 70% | 38% |
| 수정 후 (사실 정정 + 응답 조립 + 지시문) | 97% | 90% | 36% |
| 배포 구성 (지시문 제외) | 88% | 85% | 측정 안 함 |

- **dev 개선은 홀드아웃으로 일반화되지 않았다.** 홀드아웃 차이는 −0.022 [−0.156, +0.133]이고, 시나리오별로 2승 3패 10무다(E-30).
- 사전 등록한 기준("수정 후가 수정 전보다 낮지 않으면 유지")을 1/45회 차이로 넘지 못했다. 그래서 평가로만 근거가 있는 지시문은 되돌리고, 기준 자료와 대조한 테스트로 검증되는 사실 정정과 응답 조립 수정만 남겼다(A-35).
- 배포 구성의 dev 결과로 나눠 보면, 사실 정정과 응답 조립이 72% → 88%를 만들었다(함수 혼동, 없는 함수, 경고 오판, 잘못된 모델 ID). 지시문이 더하던 9%p는 쿼터 소진(s12)과 의도된 중복 억제(s13) 두 시나리오였다.
- **홀드아웃 실패의 주원인은 에이전트가 볼 수 없는 정보다.** 에이전트는 로그와 지표만 본다. 함수 설정(환경 변수, 제한 시간, 레이어), 코드, IAM 정책, 플랫폼 한도(API Gateway 29초)를 볼 수 없어 원인을 짐작한다.

### 홀드아웃 v2: 설정·권한 조회 도구 (E-31 사전 등록, E-32)

| 구성 | pass@1 | 실행당 비용 |
|---|---:|---:|
| v1.9.1 | 44% | $0.0149 |
| 설정·권한 도구 + 한도 런북 | 49% | $0.0211 |
| 도구만 (탐색용) | 48% | $0.0181 |

- 차이 +0.044 [−0.067, +0.156]로 사전 등록 기준(구간 하한 > 0)을 넘지 못해 **채택하지 않았다.** 도구는 평가에서만 켠다(A-38).
- **채점기 검증**: 원인은 맞고 조치만 실패한 48건을 구성을 가린 채 별도 에이전트가 판정했더니, 25건(52%)은 맞는 조치를 다른 표현으로 썼다. 맞는 답을 통과로 바꿔도 판단은 같았다(+0.078 [−0.044, +0.200]).
- 다음 개선의 병목은 에이전트가 아니라 채점기다. 사람 판정 표본과의 일치도를 먼저 잰다.

## 한계

- 시나리오 수가 적다(dev 20, 홀드아웃 15). 시나리오 1개가 pass@1을 2~7%p 움직인다.
- 원인·조치 표현 목록은 같은 뜻의 다른 표현을 놓칠 수 있다. 채점을 바꿀 때마다 응답을 직접 읽고 대조했다.
- 홀드아웃 채점의 알려진 결함: h12(전체 상태 점검)는 `get_function_status('all')` 호출을 증거로 인정하지 않는다. 두 구성 모두 같은 영향을 받는다. 결과를 본 뒤에는 고치지 않았다.
- **조치 채점이 거칠다.** 자유 서술 답의 조치를 표현 목록으로 채점하면 맞는 답의 약 절반을 놓친다(E-32). 절대값은 낮게 나오고, 구성 간 차이도 잡음에 묻힌다.
- 홀드아웃 v1·v2는 각각 한 번 썼다. 다음 변경을 확인하려면 새 홀드아웃이 필요하다.
