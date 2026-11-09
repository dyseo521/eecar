#!/usr/bin/env bash
# 선별 실행에서 오류로 끝난 실행만 다시 돌린다 (평가 인프라 오류, 모델 결과 아님)
set -euo pipefail
export AWS_REGION=ap-northeast-2
export EVAL_MODEL_MAP='claude-haiku-4-5-20251001=claude-haiku-5-5'
export EVAL_SPEND_FILE="$(cygpath -m "$HOME")/.eecar-anthropic-spend-h55-tune.jsonl"
export EVAL_USD_CAP=10
RUN="node --import tsx --import ./eval/ts/opt-alias.mjs --import ./eval/ts/anthropic-shim.mjs"
for v in "$@"; do
  f=$(ls -t eval/reports/*-agent-eval-h55-"$v".json | head -1)
  $RUN eval/ts/agent-eval.ts --scenarios eval/agent/scenarios_v3.json --runs 2 --variant h55 --harness "eval/agent/h55/$v.json" --tag "h55-$v" --concurrency 6 --retry-errors "$f" > "eval/reports/h55-$v.retry.out" 2>&1 &
done
wait
for v in "$@"; do
  f=$(ls -t eval/reports/*-agent-eval-h55-"$v".json | head -1)
  grep -h "오류 유형" "eval/reports/h55-$v.retry.out" || true
  $RUN eval/ts/agent-structured-score.ts "$f"
done
