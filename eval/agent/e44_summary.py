"""E-44 결과 요약: 범주별 통과 횟수와 사전 기준, 실행 지표, 기억 검색 적중.

    python -X utf8 eval/agent/e44_summary.py          # 본 실행
    python -X utf8 eval/agent/e44_summary.py pilot    # 시범 실행
"""
import glob
import json
import os
import sys
from collections import defaultdict

pilot = len(sys.argv) > 1 and sys.argv[1] == "pilot"
suffix = "-pilot" if pilot else ""
R = "eval/reports/"
spec = json.load(open("eval/agent/scenarios_v6_memory.json", encoding="utf-8"))
category = {s["id"]: s["attrs"]["memoryCategory"] for s in spec["scenarios"]}
seeds = {s["id"]: s.get("memories", []) for s in spec["scenarios"]}


def latest(kind, tag):
    files = sorted(glob.glob(f"{R}*-agent-{kind}-{tag}.json"), key=os.path.getmtime)
    return files[-1] if files else None


rows = {}
for cond in ("off", "on"):
    tag = f"e44-{cond}{suffix}"
    ev, jd = latest("eval", tag), latest("judge", tag)
    if not ev or not jd:
        print(f"{cond}: 결과 없음 ({tag})")
        continue
    results = {(r["id"], int(r["run"])): r for r in json.load(open(ev, encoding="utf-8"))["results"]}
    judgments = json.load(open(jd, encoding="utf-8"))["judgments"]
    rows[cond] = [(j, results.get((j["scenario"], int(j["run"])))) for j in judgments]

print("## 범주별 LLM Judge 통과 (기억 없음 / 기억 있음)")
passes = defaultdict(lambda: defaultdict(int))
totals = defaultdict(lambda: defaultdict(int))
for cond, items in rows.items():
    for j, _ in items:
        c = category[j["scenario"]]
        totals[cond][c] += 1
        passes[cond][c] += str(j["pass"]) == "True"
for c in ("recurrence", "decoy", "stale"):
    print(f"  {c:10s} {passes['off'][c]}/{totals['off'][c]}  ->  {passes['on'][c]}/{totals['on'][c]}")

if not pilot and {"off", "on"} <= rows.keys():
    print("\n## 사전 기준 (E-44)")
    d = passes["on"]["recurrence"] - passes["off"]["recurrence"]
    print(f"  재발: 기억 있음이 3회 이상 더 통과 -> {d:+d}회, {'충족' if d >= 3 else '미충족'}")
    for c in ("decoy", "stale"):
        d = passes["on"][c] - passes["off"][c]
        print(f"  {c}: 1회 넘게 줄지 않음 -> {d:+d}회, {'충족' if d >= -1 else '미충족'}")

print("\n## 실행 지표 (평균)")
for cond, items in rows.items():
    m = [r["metrics"] for _, r in items if r]
    n = max(len(m), 1)
    recalls = sum(sum(1 for t in x.get("tools", []) if t.get("name") == "recall_memory") for x in m)
    proposals = sum(sum(1 for t in x.get("tools", []) if t.get("name") == "propose_memory") for x in m)
    print(f"  {cond}: 실행 {len(m)}회, 턴 {sum(x.get('turns', 0) for x in m) / n:.2f}, 도구 호출 {sum(x.get('toolCalls', 0) for x in m) / n:.2f}, "
          f"recall_memory {recalls}회, propose_memory {proposals}회")

# 기억 검색 적중은 eval/ts/e44-recall-stats.ts가 에이전트의 검색 입력을 다시 실행해 센다 (실행 기록의 도구 결과는 500자에서 잘린다)

ledger = os.path.expanduser("~/.eecar-anthropic-spend-e44.jsonl")
if os.path.exists(ledger):
    by = defaultdict(float)
    for line in open(ledger, encoding="utf-8"):
        e = json.loads(line)
        by["agent (Haiku)" if "haiku" in e["model"] else "LLM Judge (Sonnet)" if "sonnet" in e["model"] else e["model"]] += e["usd"]
    print("\n## 비용 (E-44 장부 누적, 시범 포함)")
    for k, v in by.items():
        print(f"  {k}: ${v:.3f}")
    print(f"  합계: ${sum(by.values()):.3f}")
