#!/usr/bin/env bash
# 시나리오 v3 홀드아웃의 Haiku 5.5 탐색 실행 (사전 등록은 docs/DECISION_LOG.md E-36).
# 후보 코드와 프롬프트는 그대로 두고 기본 모델만 바꾼다. 이번 채택 판단에는 쓰지 않는다.
# 복잡한 질문의 첫 턴은 운영과 같이 Sonnet 4.6으로 간다. 판정 모델도 그대로 Sonnet 4.6이다.
set -euo pipefail

export AWS_REGION=ap-northeast-2
export EVAL_MODEL_MAP='claude-haiku-4-5-20251001=claude-haiku-5-5'
# 4.5 실행과 지출 상한을 나눠 쓰지 않도록 장부를 분리한다
export EVAL_SPEND_FILE="$(cygpath -m "$HOME")/.eecar-anthropic-spend-haiku55.jsonl"
export EVAL_USD_CAP=25

SCENARIOS=eval/agent/scenarios_v3_holdout.json
RUN="node --import tsx --import ./eval/ts/opt-alias.mjs --import ./eval/ts/anthropic-shim.mjs"
SONNET=global.anthropic.claude-sonnet-4-6
TPR=0.81
TNR=0.92

latest() { ls -t eval/reports/*-"$1".json 2>/dev/null | head -1 || true; }

# 1) 에이전트 실행
if [ -z "$(latest agent-eval-v3holdout55-candidate)" ]; then
  $RUN eval/ts/agent-eval.ts --scenarios "$SCENARIOS" --runs 3 --variant candidate --tag v3holdout55-candidate --concurrency 8
fi
B=$(latest agent-eval-v3holdout55-candidate)
[ -n "$B" ] || { echo "에이전트 실행 결과가 없다" >&2; exit 1; }

# 2) 판정 2회, 갈린 항목만 3번째
judge() {
  local tag=$1; shift
  local file
  file=$(latest "agent-judge-$tag")
  $RUN eval/ts/agent-judge.ts --report "$B" --model "$SONNET" --tag "$tag" --concurrency 12 ${file:+--resume "$file"} "$@" | tail -1
}
judge v3holdout55-r1
judge v3holdout55-r2
ITEMS=eval/reports/v3holdout55-disagreements.json
npx tsx eval/ts/agent-judge-disagreements.ts "$(latest agent-judge-v3holdout55-r1)" "$(latest agent-judge-v3holdout55-r2)" --out "$ITEMS"
judge v3holdout55-r3 --items "$ITEMS"

# 3) 다수결과 v1.9.1 비교 (v1.9.1 쪽은 4.5 홀드아웃 실행의 결과를 쓴다)
OUT=eval/reports/$(date -u +%F)-agent-judge-v3holdout55-majority.json
npx tsx eval/ts/agent-judge-majority.ts --out "$OUT" "$(latest agent-judge-v3holdout55-r1)" "$(latest agent-judge-v3holdout55-r2)" "$(latest agent-judge-v3holdout55-r3)"
npx tsx eval/ts/agent-judge-to-report.ts "$OUT" --variant candidate --tpr "$TPR" --tnr "$TNR" --scenarios "$SCENARIOS" --out "${OUT%.json}-candidate.json"
for _ in $(seq 1 120); do
  A=$(latest agent-judge-v3holdout-majority-shipped)
  [ -n "$A" ] && break
  sleep 30
done
[ -n "$A" ] || { echo "v1.9.1 보고서를 기다리다 시간이 지났다" >&2; exit 1; }
npx tsx eval/ts/agent-compare.ts "$A" "${OUT%.json}-candidate.json"

# 4) 보조 지표
$RUN eval/ts/agent-structured-score.ts "$B"
