#!/usr/bin/env bash
# 시나리오 v3 홀드아웃 비교: v1.9.1 대 후보 (사전 등록은 docs/DECISION_LOG.md E-35).
# 사전 등록 커밋 뒤에 한 번만 실행한다. 저장소 루트에서 실행한다.
#
# Anthropic API로 실행한다(eval/ts/anthropic-shim.mjs). AWS 비용과 운영의 일일 토큰 한도를 쓰지 않는다.
# 필요: 저장소 루트 .env의 ANTHROPIC_API_KEY, npm install --no-save @anthropic-ai/sdk
# 예상 비용: 에이전트 약 $5, 판정 약 $19 (2회 + 갈린 항목만 3번째). 상한은 EVAL_USD_CAP(기본 50).
# 중단되면 그대로 다시 실행한다. 끝난 실행은 건너뛰고, 판정은 이어서 한다.
set -euo pipefail

export AWS_REGION=ap-northeast-2
SCENARIOS=eval/agent/scenarios_v3_holdout.json
RUN="node --import tsx --import ./eval/ts/opt-alias.mjs --import ./eval/ts/anthropic-shim.mjs"
SONNET=global.anthropic.claude-sonnet-4-6
# 판정 모델 v2.2 3회 다수결의 시험용 검증값 (E-33)
TPR=0.81
TNR=0.92

latest() { ls -t eval/reports/*-"$1".json 2>/dev/null | head -1 || true; }

# 1) 에이전트 실행
for variant in shipped candidate; do
  tag="v3holdout-$variant"
  if [ -z "$(latest "agent-eval-$tag")" ]; then
    $RUN eval/ts/agent-eval.ts --scenarios "$SCENARIOS" --runs 3 --variant "$variant" --tag "$tag" --concurrency 8 &
  fi
done
wait
A=$(latest agent-eval-v3holdout-shipped)
B=$(latest agent-eval-v3holdout-candidate)
[ -n "$A" ] && [ -n "$B" ] || { echo "에이전트 실행 결과가 없다" >&2; exit 1; }

# 2) 판정 2회. 중단되면 이미 판정한 건은 저장되어 있다
judge() {
  local tag=$1; shift
  local file
  file=$(latest "agent-judge-$tag")
  $RUN eval/ts/agent-judge.ts --report "$A" --report "$B" --model "$SONNET" --tag "$tag" --concurrency 12 ${file:+--resume "$file"} "$@" | tail -1
}
judge v3holdout-r1
judge v3holdout-r2

# 3) 갈린 항목만 3번째 판정 (일치한 항목은 3번째가 다수결을 바꿀 수 없다)
ITEMS=eval/reports/v3holdout-disagreements.json
npx tsx eval/ts/agent-judge-disagreements.ts "$(latest agent-judge-v3holdout-r1)" "$(latest agent-judge-v3holdout-r2)" --out "$ITEMS"
judge v3holdout-r3 --items "$ITEMS"

# 4) 다수결과 비교
OUT=eval/reports/$(date -u +%F)-agent-judge-v3holdout-majority.json
npx tsx eval/ts/agent-judge-majority.ts --out "$OUT" "$(latest agent-judge-v3holdout-r1)" "$(latest agent-judge-v3holdout-r2)" "$(latest agent-judge-v3holdout-r3)"
for variant in shipped candidate; do
  npx tsx eval/ts/agent-judge-to-report.ts "$OUT" --variant "$variant" --tpr "$TPR" --tnr "$TNR" --scenarios "$SCENARIOS" --out "${OUT%.json}-$variant.json"
done
npx tsx eval/ts/agent-compare.ts "${OUT%.json}-shipped.json" "${OUT%.json}-candidate.json"

# 5) 보조 지표
$RUN eval/ts/agent-structured-score.ts "$B"
