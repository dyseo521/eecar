#!/usr/bin/env bash
# 장기 기억의 효과와 해 (E-44). 저장소 루트에서 실행한다.
#   시범: ONLY=v6-01 RUNS=1 bash eval/agent/h55/run-e44.sh
#   본 실행: bash eval/agent/h55/run-e44.sh
set -euo pipefail

export AWS_REGION=ap-northeast-2
export EVAL_MODEL_MAP='claude-haiku-4-5-20251001=claude-haiku-5-5'
export EVAL_SPEND_FILE="$(cygpath -m "$HOME")/.eecar-anthropic-spend-e44.jsonl"
export EVAL_USD_CAP="${EVAL_USD_CAP:-3.2}"
# 기억 검색은 운영과 같은 Titan v2 임베딩을 쓴다 (anthropic-shim의 유일한 예외)
export EVAL_ALLOW_TITAN=1
RUN="node --import tsx --import ./eval/ts/opt-alias.mjs --import ./eval/ts/anthropic-shim.mjs"
RUNS="${RUNS:-2}"
ONLY="${ONLY:-}"
latest() { ls -t eval/reports/*-"$1".json 2>/dev/null | head -1 || true; }

python -X utf8 eval/agent/build_v6_conditions.py

for cond in off on; do
  tag="e44-$cond${ONLY:+-pilot}"
  [ -n "$(latest "agent-eval-$tag")" ] || $RUN eval/ts/agent-eval.ts --scenarios "eval/agent/scenarios_v6_memory_$cond.json" --runs "$RUNS" \
    --variant h55 --harness eval/agent/h55/v9-mem.json --tag "$tag" --concurrency 4 ${ONLY:+--only "$ONLY"} > "eval/reports/$tag.out" 2>&1
  grep -h "오류 유형" "eval/reports/$tag.out" || true
  file=$(latest "agent-judge-$tag")
  $RUN eval/ts/agent-judge.ts --report "$(latest "agent-eval-$tag")" --agent-prompt eval/agent/h55/system-v9-mem.txt \
    --model global.anthropic.claude-sonnet-4-6 --tag "$tag" --concurrency 4 ${file:+--resume "$file"} | tail -1
done

python -X utf8 eval/agent/e44_summary.py "${ONLY:+pilot}"
