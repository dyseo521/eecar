"""E-44 조건별 시나리오 파일을 만든다.

- off: 기억 없음 (memories를 비운다)
- on: 12개 시나리오의 기억을 모두 합친 저장소를 모든 시나리오에 넣는다 (다른 시나리오의 기억이 경쟁 후보가 된다)
판정 모델은 보고서의 scenarioFile로 시나리오를 다시 읽으므로, 조건마다 파일을 따로 둔다.
"""
import copy
import json

SRC = "eval/agent/scenarios_v6_memory.json"
spec = json.load(open(SRC, encoding="utf-8"))
scenarios = spec["scenarios"]
pooled = [m for s in scenarios for m in s.get("memories", [])]
keys = [m["key"] for m in pooled]
assert len(keys) == len(set(keys)), "기억 key가 겹친다"

for cond in ("off", "on"):
    out = copy.deepcopy(spec)
    out["description"] = f"{spec.get('description', '')} [E-44 조건: {cond}]"
    for s in out["scenarios"]:
        s["memories"] = copy.deepcopy(pooled) if cond == "on" else []
    json.dump(out, open(f"eval/agent/scenarios_v6_memory_{cond}.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(cond, len(out["scenarios"]), "시나리오, 기억", len(out["scenarios"][0]["memories"]))
