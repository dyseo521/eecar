#!/usr/bin/env bash
# Haiku 5.5의 가설 판정 실행을 Sonnet 5.5로 승격해 V2와 비교한다 (E-39). 저장소 루트에서 실행한다.
#   bash eval/agent/h55/run-s55.sh [승격할 실행 수 제한]
set -euo pipefail

export AWS_REGION=ap-northeast-2
export EVAL_MODEL_MAP='claude-haiku-4-5-20251001=claude-haiku-5-5'
export EVAL_SPEND_FILE="$(cygpath -m "$HOME")/.eecar-anthropic-spend-s55.jsonl"
export EVAL_USD_CAP="${EVAL_USD_CAP:-5}"
RUN="node --import tsx --import ./eval/ts/opt-alias.mjs --import ./eval/ts/anthropic-shim.mjs"
SCENARIOS=eval/agent/scenarios_v3_holdout.json
latest() { ls -t eval/reports/*-"$1".json 2>/dev/null | head -1 || true; }
OUT="eval/reports/$(date -u +%F)-agent-eval-h55-s55esc.json"

$RUN eval/ts/agent-escalate.ts --base "$(latest agent-eval-h55-v2)" --scenarios "$SCENARIOS" --harness eval/agent/h55/s55-escalate.json --tag h55-s55esc --out "$OUT" --concurrency 4 ${1:+--limit "$1"}
[ -z "${1:-}" ] || { echo "제한 실행 종료"; exit 0; }

python -X utf8 - "$OUT" <<'PY'
import json, sys
rows = json.load(open(sys.argv[1], encoding="utf-8"))["results"]
items = [{"id": f"h55|{r['id']}|{r['run']}", "variant": "h55", "scenario": r["id"], "run": r["run"]} for r in rows if (r.get("escalation") or {}).get("applied")]
json.dump(items, open("eval/reports/h55-s55esc-items.json", "w", encoding="utf-8"))
print("판정 항목", len(items))
PY
file=$(latest agent-judge-h55-s55esc)
env -u EVAL_EFFORT $RUN eval/ts/agent-judge.ts --report "$OUT" --items eval/reports/h55-s55esc-items.json --agent-prompt eval/agent/h55/system-v1.txt --model global.anthropic.claude-sonnet-4-6 --tag h55-s55esc --concurrency 6 ${file:+--resume "$file"} | tail -1

python -X utf8 - "$(latest agent-judge-h55-v2)" "$(latest agent-judge-h55-s55esc)" <<'PY'
import json, sys
v2 = json.load(open(sys.argv[1], encoding="utf-8"))
new = {(j["scenario"], j["run"]): j for j in json.load(open(sys.argv[2], encoding="utf-8"))["judgments"]}
v2["judgments"] = [new.get((j["scenario"], j["run"]), j) for j in v2["judgments"] if j["run"] in (0, 1)]
json.dump(v2, open("eval/reports/h55-s55esc-merged.json", "w", encoding="utf-8"), ensure_ascii=False)
PY
npx tsx eval/ts/agent-judge-to-report.ts eval/reports/h55-s55esc-merged.json --variant h55 --scenarios "$SCENARIOS" --out eval/reports/h55-s55esc-report.json
echo "=== V2 대 승격"
npx tsx eval/ts/agent-compare.ts eval/reports/h55-v2-report.json eval/reports/h55-s55esc-report.json | sed -n 1,30p
