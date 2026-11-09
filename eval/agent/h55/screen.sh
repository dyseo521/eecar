#!/usr/bin/env bash
# Haiku 5.5 하네스 변형 1차 선별 (DECISION_LOG E-37). 저장소 루트에서 실행한다.
# 에이전트만 돌린다. 판정 모델은 쓰지 않아 변형당 약 $0.4다. 지표는 명백히 나쁜 변형을 빼는 데만 쓴다.
#   bash eval/agent/h55/screen.sh v0 v1 v2 v3 v4 v5
set -euo pipefail

export AWS_REGION=ap-northeast-2
export EVAL_MODEL_MAP='claude-haiku-4-5-20251001=claude-haiku-5-5'
export EVAL_SPEND_FILE="$(cygpath -m "$HOME")/.eecar-anthropic-spend-h55-tune.jsonl"
export EVAL_USD_CAP=10

RUN="node --import tsx --import ./eval/ts/opt-alias.mjs --import ./eval/ts/anthropic-shim.mjs"
for v in "$@"; do
  $RUN eval/ts/agent-eval.ts --scenarios eval/agent/scenarios_v3.json --runs 2 --variant h55 --harness "eval/agent/h55/$v.json" --tag "h55-$v" --concurrency 8 > "eval/reports/h55-$v.out" 2>&1 &
done
wait
for v in "$@"; do
  f=$(ls -t eval/reports/*-agent-eval-h55-"$v".json | head -1)
  $RUN eval/ts/agent-structured-score.ts "$f"
done
