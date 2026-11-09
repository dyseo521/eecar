#!/usr/bin/env bash
# 정보 접근 도구 3종의 효과를 새 시나리오에서 잰다 (E-41). 저장소 루트에서 실행한다.
set -euo pipefail

export AWS_REGION=ap-northeast-2
export EVAL_MODEL_MAP='claude-haiku-4-5-20251001=claude-haiku-5-5'
export EVAL_SPEND_FILE="$(cygpath -m "$HOME")/.eecar-anthropic-spend-v9.jsonl"
export EVAL_USD_CAP="${EVAL_USD_CAP:-6.5}"
RUN="node --import tsx --import ./eval/ts/opt-alias.mjs --import ./eval/ts/anthropic-shim.mjs"
SCENARIOS=eval/agent/scenarios_v5_tools.json
latest() { ls -t eval/reports/*-"$1".json 2>/dev/null | head -1 || true; }

python -X utf8 - <<'PY'
import json
ids = [s["id"] for s in json.load(open("eval/agent/scenarios_v5_tools.json", encoding="utf-8"))["scenarios"]]
json.dump([{"id": f"h55|{i}|{r}", "variant": "h55", "scenario": i, "run": r} for i in ids for r in (0, 1)], open("eval/reports/h55-v5-items.json", "w", encoding="utf-8"))
PY

for pair in "v5base:eval/agent/h55/v2.json:eval/agent/h55/system-v1.txt" "v5tools:eval/agent/h55/v9.json:eval/agent/h55/system-v9.txt"; do
  IFS=: read -r name harness prompt <<< "$pair"
  [ -n "$(latest "agent-eval-h55-$name")" ] || $RUN eval/ts/agent-eval.ts --scenarios "$SCENARIOS" --runs 2 --variant h55 --harness "$harness" --tag "h55-$name" --concurrency 6 > "eval/reports/h55-$name.out" 2>&1
  grep -h "오류 유형" "eval/reports/h55-$name.out" || true
  file=$(latest "agent-judge-h55-$name")
  $RUN eval/ts/agent-judge.ts --report "$(latest "agent-eval-h55-$name")" --items eval/reports/h55-v5-items.json --agent-prompt "$prompt" --model global.anthropic.claude-sonnet-4-6 --tag "h55-$name" --concurrency 6 ${file:+--resume "$file"} | tail -1
  npx tsx eval/ts/agent-judge-to-report.ts "$(latest "agent-judge-h55-$name")" --variant h55 --scenarios "$SCENARIOS" --out "eval/reports/h55-$name-report.json"
done
echo "=== 기존 도구 대 정보 접근 도구"
npx tsx eval/ts/agent-compare.ts eval/reports/h55-v5base-report.json eval/reports/h55-v5tools-report.json | sed -n 1,3p
