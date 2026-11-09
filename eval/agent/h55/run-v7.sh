#!/usr/bin/env bash
# V7(V2 + 영향 요약 도구 + 판단 지침)을 V2와 비교한다 (E-38). 저장소 루트에서 실행한다.
# 다른 실험 장부와 섞이지 않게 별도 장부를 쓰고 상한을 $3로 둔다.
set -euo pipefail

export AWS_REGION=ap-northeast-2
export EVAL_MODEL_MAP='claude-haiku-4-5-20251001=claude-haiku-5-5'
export EVAL_SPEND_FILE="$(cygpath -m "$HOME")/.eecar-anthropic-spend-h55-nofault.jsonl"
export EVAL_USD_CAP=3
RUN="node --import tsx --import ./eval/ts/opt-alias.mjs --import ./eval/ts/anthropic-shim.mjs"
SCENARIOS=eval/agent/scenarios_v3_holdout.json
latest() { ls -t eval/reports/*-"$1".json 2>/dev/null | head -1 || true; }

[ -n "$(latest agent-eval-h55-v7)" ] || $RUN eval/ts/agent-eval.ts --scenarios "$SCENARIOS" --runs 2 --variant h55 --harness eval/agent/h55/v7.json --tag h55-v7 --concurrency 6 > eval/reports/h55-v7.out 2>&1
grep -h "오류 유형" eval/reports/h55-v7.out || true
file=$(latest agent-judge-h55-v7)
$RUN eval/ts/agent-judge.ts --report "$(latest agent-eval-h55-v7)" --items eval/reports/h55-judge-items.json --agent-prompt eval/agent/h55/system-v7.txt --model global.anthropic.claude-sonnet-4-6 --tag h55-v7 --concurrency 6 ${file:+--resume "$file"} | tail -1
npx tsx eval/ts/agent-judge-to-report.ts "$(latest agent-judge-h55-v7)" --variant h55 --scenarios "$SCENARIOS" --out eval/reports/h55-v7-report.json
echo "=== V2 대 V7"
npx tsx eval/ts/agent-compare.ts eval/reports/h55-v2-report.json eval/reports/h55-v7-report.json | sed -n 1,40p
