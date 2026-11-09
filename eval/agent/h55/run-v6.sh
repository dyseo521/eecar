#!/usr/bin/env bash
# V6(V2 + 로그 정리)를 시나리오 40개에 1회씩 돌려 V2의 같은 회차와 비교한다 (E-37). 저장소 루트에서 실행한다.
# 평가 로그에는 EMF가 거의 없어 이 비교는 START·END·REPORT 정리와 반복 줄 묶기가 정확도를 해치는지만 본다.
set -euo pipefail

export AWS_REGION=ap-northeast-2
export EVAL_MODEL_MAP='claude-haiku-4-5-20251001=claude-haiku-5-5'
export EVAL_SPEND_FILE="$(cygpath -m "$HOME")/.eecar-anthropic-spend-h55-tune.jsonl"
export EVAL_USD_CAP=13
RUN="node --import tsx --import ./eval/ts/opt-alias.mjs --import ./eval/ts/anthropic-shim.mjs"
SCENARIOS=eval/agent/scenarios_v3_holdout.json
latest() { ls -t eval/reports/*-"$1".json 2>/dev/null | head -1 || true; }

[ -n "$(latest agent-eval-h55-v6)" ] || $RUN eval/ts/agent-eval.ts --scenarios "$SCENARIOS" --runs 1 --variant h55 --harness eval/agent/h55/v6.json --tag h55-v6 --concurrency 8 > eval/reports/h55-v6.out 2>&1
grep -h "오류 유형" eval/reports/h55-v6.out || true
python - <<'PY'
import glob, json
ids = [s["id"] for s in json.load(open("eval/agent/scenarios_v3_holdout.json", encoding="utf-8"))["scenarios"]]
json.dump([{"id": f"h55|{i}|0", "variant": "h55", "scenario": i, "run": 0} for i in ids], open("eval/reports/h55-v6-items.json", "w", encoding="utf-8"))
d = json.load(open(sorted(glob.glob("eval/reports/*-agent-judge-h55-v2.json"))[-1], encoding="utf-8"))
d["judgments"] = [j for j in d["judgments"] if j["run"] == 0]
json.dump(d, open("eval/reports/h55-v2-run0.json", "w", encoding="utf-8"), ensure_ascii=False)
print("V2 1회차 판정", len(d["judgments"]))
PY
npx tsx eval/ts/agent-judge-to-report.ts eval/reports/h55-v2-run0.json --variant h55 --scenarios "$SCENARIOS" --out eval/reports/h55-v2-run0-report.json
file=$(latest agent-judge-h55-v6)
$RUN eval/ts/agent-judge.ts --report "$(latest agent-eval-h55-v6)" --items eval/reports/h55-v6-items.json --agent-prompt eval/agent/h55/system-v1.txt --model global.anthropic.claude-sonnet-4-6 --tag h55-v6 --concurrency 6 ${file:+--resume "$file"} | tail -1
npx tsx eval/ts/agent-judge-to-report.ts "$(latest agent-judge-h55-v6)" --variant h55 --scenarios "$SCENARIOS" --out eval/reports/h55-v6-report.json
echo "=== V2(1회차) 대 V6"
npx tsx eval/ts/agent-compare.ts eval/reports/h55-v2-run0-report.json eval/reports/h55-v6-report.json | sed -n 1,8p
$RUN eval/ts/agent-structured-score.ts "$(latest agent-eval-h55-v6)"
