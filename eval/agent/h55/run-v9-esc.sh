#!/usr/bin/env bash
# 도구 3종 구성(V9)의 hypothesis 실행을 Sonnet 5.5로 승격해 새 시나리오에서 비교한다 (E-42). run-v9.sh 다음에 실행한다.
set -euo pipefail

export AWS_REGION=ap-northeast-2
export EVAL_MODEL_MAP='claude-haiku-4-5-20251001=claude-haiku-5-5'
export EVAL_SPEND_FILE="$(cygpath -m "$HOME")/.eecar-anthropic-spend-v9.jsonl"
export EVAL_USD_CAP="${EVAL_USD_CAP:-8}"
RUN="node --import tsx --import ./eval/ts/opt-alias.mjs --import ./eval/ts/anthropic-shim.mjs"
SCENARIOS=eval/agent/scenarios_v5_tools.json
latest() { ls -t eval/reports/*-"$1".json 2>/dev/null | head -1 || true; }
OUT="eval/reports/$(date -u +%F)-agent-eval-h55-v5esc.json"

$RUN eval/ts/agent-escalate.ts --base "$(latest agent-eval-h55-v5tools)" --scenarios "$SCENARIOS" --harness eval/agent/h55/s55-v9.json --tag h55-v5esc --out "$OUT" --concurrency 4

python -X utf8 - "$OUT" <<'PY'
import json, sys
rows = json.load(open(sys.argv[1], encoding="utf-8"))["results"]
items = [{"id": f"h55|{r['id']}|{r['run']}", "variant": "h55", "scenario": r["id"], "run": r["run"]} for r in rows if (r.get("escalation") or {}).get("applied")]
json.dump(items, open("eval/reports/h55-v5esc-items.json", "w", encoding="utf-8"))
print("판정 항목", len(items))
PY
file=$(latest agent-judge-h55-v5esc)
env -u EVAL_EFFORT $RUN eval/ts/agent-judge.ts --report "$OUT" --items eval/reports/h55-v5esc-items.json --agent-prompt eval/agent/h55/system-v9.txt --model global.anthropic.claude-sonnet-4-6 --tag h55-v5esc --concurrency 6 ${file:+--resume "$file"} | tail -1

python -X utf8 - "$(latest agent-judge-h55-v5tools)" "$(latest agent-judge-h55-v5esc)" <<'PY'
import json, sys
base = json.load(open(sys.argv[1], encoding="utf-8"))
new = {(j["scenario"], j["run"]): j for j in json.load(open(sys.argv[2], encoding="utf-8"))["judgments"]}
base["judgments"] = [new.get((j["scenario"], j["run"]), j) for j in base["judgments"]]
json.dump(base, open("eval/reports/h55-v5esc-merged.json", "w", encoding="utf-8"), ensure_ascii=False)
PY
npx tsx eval/ts/agent-judge-to-report.ts eval/reports/h55-v5esc-merged.json --variant h55 --scenarios "$SCENARIOS" --out eval/reports/h55-v5esc-report.json
echo "=== 도구 3종 대 승격"
npx tsx eval/ts/agent-compare.ts eval/reports/h55-v5tools-report.json eval/reports/h55-v5esc-report.json | sed -n 1,2p
