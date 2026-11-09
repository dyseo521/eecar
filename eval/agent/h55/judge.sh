#!/usr/bin/env bash
# Haiku 5.5 하네스 변형을 판정 모델로 측정한다 (E-37). 저장소 루트에서 실행한다.
#   bash eval/agent/h55/judge.sh v1 v2
# 비교 기준 V0은 E-36의 판정 1회차를 재사용하므로, 같은 시나리오 40개의 앞 2회만 판정한다.
# 동시 연결 수 한도(429)를 피하려고 변형을 하나씩, 낮은 동시 실행으로 돌린다.
set -euo pipefail

export AWS_REGION=ap-northeast-2
export EVAL_SPEND_FILE="$(cygpath -m "$HOME")/.eecar-anthropic-spend-h55-tune.jsonl"
export EVAL_USD_CAP="${EVAL_USD_CAP:-10}"
RUN="node --import tsx --import ./eval/ts/opt-alias.mjs --import ./eval/ts/anthropic-shim.mjs"
SONNET=global.anthropic.claude-sonnet-4-6
SCENARIOS=eval/agent/scenarios_v3_holdout.json

latest() { ls -t eval/reports/*-"$1".json 2>/dev/null | head -1 || true; }

python - <<'PY'
import json
ids = [s["id"] for s in json.load(open("eval/agent/scenarios_v3_holdout.json", encoding="utf-8"))["scenarios"]]
items = [{"id": f"h55|{i}|{r}", "variant": "h55", "scenario": i, "run": r} for i in ids for r in (0, 1)]
json.dump(items, open("eval/reports/h55-judge-items.json", "w", encoding="utf-8"))
print(len(items), "항목")

# V0: E-36 판정 1회차에서 같은 시나리오·회차만 뽑는다
d = json.load(open(sorted(__import__("glob").glob("eval/reports/*-agent-judge-v3holdout55-r1.json"))[-1], encoding="utf-8"))
d["judgments"] = [j for j in d["judgments"] if j["run"] in (0, 1)]
for j in d["judgments"]:
    j["variant"] = "h55"
json.dump(d, open("eval/reports/h55-v0-judged.json", "w", encoding="utf-8"), ensure_ascii=False)
print("V0 판정", len(d["judgments"]))
PY
npx tsx eval/ts/agent-judge-to-report.ts eval/reports/h55-v0-judged.json --variant h55 --scenarios "$SCENARIOS" --out eval/reports/h55-v0-report.json

for v in "$@"; do
  report=$(latest "agent-eval-h55-$v")
  prompt=$(python -c "import json,sys; print(json.load(open('eval/agent/h55/$v.json',encoding='utf-8'))['prompt'])")
  file=$(latest "agent-judge-h55-$v")
  $RUN eval/ts/agent-judge.ts --report "$report" --items eval/reports/h55-judge-items.json --agent-prompt "$prompt" --model "$SONNET" --tag "h55-$v" --concurrency 6 ${file:+--resume "$file"} | tail -1
  npx tsx eval/ts/agent-judge-to-report.ts "$(latest "agent-judge-h55-$v")" --variant h55 --scenarios "$SCENARIOS" --out "eval/reports/h55-$v-report.json"
  echo "=== V0 대 $v"
  npx tsx eval/ts/agent-compare.ts eval/reports/h55-v0-report.json "eval/reports/h55-$v-report.json" | sed -n 1,8p
done
