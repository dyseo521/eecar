"""시나리오 v3를 dev 20개와 블라인드 홀드아웃 40개로 나눈다. 대분류(A~F) 안에서 무작위로 고른다 (시드 고정).
내용을 출력하지 않는다. 홀드아웃은 사전 등록한 뒤 실행 결과로만 본다."""
import json, io, random, collections
d = json.load(io.open("eval/agent/scenarios_v3.json", encoding="utf-8"))
DEV_PER_GROUP = {"A": 8, "B": 4, "C": 3, "D": 1, "E": 1, "F": 3}
rng = random.Random(20261106)
groups = collections.defaultdict(list)
for s in d["scenarios"]:
    groups[s["code"][0]].append(s)
dev, holdout = [], []
for g in sorted(groups):
    items = sorted(groups[g], key=lambda s: s["id"])
    rng.shuffle(items)
    dev += items[:DEV_PER_GROUP[g]]
    holdout += items[DEV_PER_GROUP[g]:]
dev.sort(key=lambda s: s["id"]); holdout.sort(key=lambda s: s["id"])
for name, items in (("dev", dev), ("holdout", holdout)):
    io.open(f"eval/agent/scenarios_v3_{name}.json", "w", encoding="utf-8").write(json.dumps({"version": f"v3-{name}", "scenarios": items}, ensure_ascii=False, indent=1) + "\n")
    print(name, len(items), sorted(collections.Counter(s["code"][0] for s in items).items()), "gap", sum(s["attrs"]["detectionGap"] for s in items), "no_fault", sum(s["truth"]["verdict"] == "no_fault" for s in items))
