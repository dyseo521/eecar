"""검색 기법 실험: 구성 그리드 실행 → dev에서 선택 → test에서 확인.

    uv run python -m eecar_eval.experiment
    uv run python -m eecar_eval.experiment --dataset v2 --grid root-cause   # 문서 정의·구현 가능 결합 (E-23)
    uv run python -m eecar_eval.experiment --dataset v3 --grid query-understanding --holdout   # 사전 등록 구성 확인

--holdout: 선택에 쓰지 않은 데이터셋에서 모든 질의를 test로 쓴다. 구성을 고르지 않고 모든 구성을 기준과 비교하므로,
해석은 다른 데이터셋의 dev에서 미리 고른 구성(결정 기록에 사전 등록)에만 한다.

과적합 방지 절차
1. 질의를 유형(qtype)별로 층화해 dev/test로 나눈다 (qid 해시 순서로 번갈아 배정, 결정적).
2. 모든 구성은 dev nDCG@10으로만 순위를 매기고 고른다.
3. 고른 구성만 test에서 현재 프로덕션 구성(BASELINE)과 질의별 쌍체 검정으로 비교한다.
test 점수를 보고 구성을 다시 고르면 이 절차가 무너진다. 그러려면 새 질의셋(v2)이 필요하다.
"""

from __future__ import annotations

import hashlib
import json
import tempfile
from datetime import date
from pathlib import Path
from typing import Any

from .compare import format_p, paired_stats
from .run import EVAL_DIR, REPO_ROOT, _git_commit, _read_jsonl, evaluate

BASELINE = "prod-ws-a0.7-c20"  # 현재 프로덕션 구성: 후보 20, α=0.7, 공백 토크나이저
ALPHAS = [round(0.1 * i, 1) for i in range(11)]


def build_grid() -> list[dict[str, Any]]:
    grid: list[dict[str, Any]] = []
    # A. 프로덕션 구조에서 α만 변경
    for a in ALPHAS:
        grid.append({"family": "A.prod-alpha", "name": f"prod-ws-a{a}-c20", "retrieval": "prod", "fusion": "weighted",
                     "alpha": a, "candidates": 20})
    # B. 프로덕션 구조에서 후보 수 x α
    for c in (50, 100):
        for a in (0.3, 0.5, 0.7):
            grid.append({"family": "B.prod-candidates", "name": f"prod-ws-a{a}-c{c}", "retrieval": "prod",
                         "fusion": "weighted", "alpha": a, "candidates": c})
    # C. 독립 검색 + 볼록 결합 (α=0 은 BM25 단독, α=1 은 벡터 단독과 같은 순위)
    for a in ALPHAS:
        grid.append({"family": "C.full-convex", "name": f"full-ws-convex-a{a}", "retrieval": "full",
                     "fusion": "weighted", "alpha": a})
    # D. 독립 검색 + RRF
    for k in (10, 30, 60, 100):
        grid.append({"family": "D.full-rrf", "name": f"full-ws-rrf-k{k}", "retrieval": "full", "fusion": "rrf", "rrfK": k})
    # E. 한국어 토크나이저 (BM25 단독, 볼록 결합, RRF)
    for tok in ("bigram", "ws+bigram"):
        grid.append({"family": "E.tokenizer", "name": f"full-{tok}-bm25", "retrieval": "full", "fusion": "bm25",
                     "tokenizer": tok})
        for a in (0.3, 0.5, 0.7):
            grid.append({"family": "E.tokenizer", "name": f"full-{tok}-convex-a{a}", "retrieval": "full",
                         "fusion": "weighted", "alpha": a, "tokenizer": tok})
        grid.append({"family": "E.tokenizer", "name": f"full-{tok}-rrf-k60", "retrieval": "full", "fusion": "rrf",
                     "rrfK": 60, "tokenizer": tok})
        grid.append({"family": "E.tokenizer", "name": f"prod-{tok}-a0.7-c20", "retrieval": "prod", "fusion": "weighted",
                     "alpha": 0.7, "candidates": 20, "tokenizer": tok})
    # F. IDF 제거 가설 (BM25 단독, 볼록 결합)
    grid.append({"family": "F.no-idf", "name": "full-ws-noidf-bm25", "retrieval": "full", "fusion": "bm25", "idf": False})
    grid.append({"family": "F.no-idf", "name": "full-ws-noidf-convex-a0.5", "retrieval": "full", "fusion": "weighted",
                 "alpha": 0.5, "idf": False})
    return grid


def build_root_cause_grid() -> list[dict[str, Any]]:
    """실패 원인 분석(E-23)에서 나온 가설을 검증하는 그리드.
    문서 정의(legacy / v2-noalias / v2)와 프로덕션에서 구현 가능한 결합(union)을 함께 본다."""
    grid: list[dict[str, Any]] = [
        {"family": "A.prod-alpha", "name": BASELINE, "retrieval": "prod", "fusion": "weighted", "alpha": 0.7,
         "candidates": 20},
        {"family": "A.prod-alpha", "name": "prod-ws-a0.9-c20", "retrieval": "prod", "fusion": "weighted", "alpha": 0.9,
         "candidates": 20},
    ]
    for doc in ("legacy", "v2-noalias", "v2"):
        # 문서 정의의 효과를 검색기별로 분리해서 본다
        grid.append({"family": "G.doc-vector", "name": f"doc-{doc}-vector", "retrieval": "full", "fusion": "vector",
                     "doc": doc})
        grid.append({"family": "G.doc-bm25", "name": f"doc-{doc}-bm25", "retrieval": "full", "fusion": "bm25", "doc": doc})
        grid.append({"family": "G.doc-prod", "name": f"doc-{doc}-prod-a0.7-c20", "retrieval": "prod",
                     "fusion": "weighted", "alpha": 0.7, "candidates": 20, "doc": doc})
        for a in (0.5, 0.6, 0.7, 0.8, 0.9):
            grid.append({"family": f"H.full-convex-{doc}", "name": f"doc-{doc}-full-a{a}", "retrieval": "full",
                         "fusion": "weighted", "alpha": a, "doc": doc})
        # 구현 가능한 형태: 각 검색기 상위 N개만 사용
        for n in (20, 50, 100):
            for a in (0.5, 0.6, 0.7, 0.8, 0.9):
                grid.append({"family": f"I.union-{doc}", "name": f"doc-{doc}-union-n{n}-a{a}", "retrieval": "union",
                             "fusion": "weighted", "alpha": a, "candidates": n, "doc": doc})
    # 임베딩 텍스트 가설 (E-23): 모든 문서에 공통인 거래 조건 줄이 임베딩 변별력을 낮춘다.
    # BM25는 v2 문서, 벡터는 문서 정의를 바꿔 가며 결합한다
    grid.append({"family": "G.doc-vector", "name": "doc-v2-notrade-vector", "retrieval": "full", "fusion": "vector",
                 "doc": "v2-notrade"})
    for vec_doc in ("legacy", "v2-notrade"):
        for a in (0.5, 0.6, 0.7, 0.8):
            grid.append({"family": f"J.mixed-bm25v2-vec{vec_doc}", "name": f"mix-bm25v2-vec{vec_doc}-full-a{a}",
                         "retrieval": "full", "fusion": "weighted", "alpha": a, "bm25Doc": "v2", "vecDoc": vec_doc})
            for n in (50, 100):
                grid.append({"family": f"K.mixed-union-vec{vec_doc}", "name": f"mix-bm25v2-vec{vec_doc}-union-n{n}-a{a}",
                             "retrieval": "union", "fusion": "weighted", "alpha": a, "candidates": n,
                             "bm25Doc": "v2", "vecDoc": vec_doc})
    return grid


# 현재 프로덕션 구성 (v1.6.0, E-23)
CURRENT = {"retrieval": "union", "fusion": "weighted", "alpha": 0.5, "candidates": 100, "bm25Doc": "v2", "vecDoc": "v2-notrade"}
CURRENT_NAME = "prod2-union-n100-a0.5"


def build_query_understanding_grid() -> list[dict[str, Any]]:
    """질의 이해(카테고리·수치 조건 감점)와 토크나이저 실험 (A-27). 기준은 현재 프로덕션(v1.6.0)."""
    grid: list[dict[str, Any]] = [{"family": "A.current", "name": CURRENT_NAME, **CURRENT}]
    for scope in ("all", "category", "numeric"):
        for p in (0.1, 0.2, 0.3, 0.5, 0.8, 1.0):
            grid.append({"family": f"Q.penalty-{scope}", "name": f"qu-{scope}-p{p}", **CURRENT,
                         "constraintPenalty": p, "constraintScope": scope})
    for tok in ("bigram", "ws+bigram"):
        for a in (0.5, 0.6):
            grid.append({"family": "T.tokenizer", "name": f"tok-{tok}-a{a}", **CURRENT, "alpha": a, "tokenizer": tok})
        for p in (0.3, 0.5, 0.8):
            grid.append({"family": "QT.tokenizer+qu", "name": f"tok-{tok}-qu-all-p{p}", **CURRENT, "tokenizer": tok,
                         "constraintPenalty": p, "constraintScope": "all"})
    return grid


# 현재 프로덕션 구성 (v1.7.0, E-26)
CURRENT_V17 = {**CURRENT, "tokenizer": "bigram", "constraintPenalty": 0.8, "constraintScope": "all"}
CURRENT_V17_NAME = "prod3-bigram-qu-p0.8"


def build_vehicle_intent_grid() -> list[dict[str, Any]]:
    """차종 조건, 카테고리 다중 추출, 원형 토큰 유지 (E-27). 기준은 v1.7.0."""
    grid: list[dict[str, Any]] = [{"family": "A.current", "name": CURRENT_V17_NAME, **CURRENT_V17}]
    for p in (0.5, 0.8):
        grid.append({"family": "V.vehicle-same", "name": f"veh-p{p}", **CURRENT_V17, "constraintPenalty": p,
                     "vehicleConstraint": True, "vehiclePenalty": p})
    # 차종 위반은 카테고리 위반보다 약하게 (다른 차종의 같은 부품 > 같은 차종의 다른 부품)
    for vp in (0.1, 0.2, 0.3, 0.5):
        grid.append({"family": "V.vehicle-weak", "name": f"veh-weak-v{vp}", **CURRENT_V17, "vehicleConstraint": True,
                     "vehiclePenalty": vp})
        grid.append({"family": "VC.vehicle-weak+category-all", "name": f"veh-weak-v{vp}-cat-all", **CURRENT_V17,
                     "vehicleConstraint": True, "vehiclePenalty": vp, "categoryMode": "all"})
    grid.append({"family": "C.category-all", "name": "cat-all", **CURRENT_V17, "categoryMode": "all"})
    grid.append({"family": "T.ws+bigram", "name": "wsbigram", **CURRENT_V17, "tokenizer": "ws+bigram"})
    grid.append({"family": "T.bigram-joined", "name": "joined", **CURRENT_V17, "tokenizer": "bigram-joined"})
    for vp in (0.2, 0.3):
        grid.append({"family": "J.joined+vehicle-weak+category-all", "name": f"joined-veh-weak-v{vp}-cat-all",
                     **CURRENT_V17, "tokenizer": "bigram-joined", "vehicleConstraint": True, "vehiclePenalty": vp,
                     "categoryMode": "all"})
    for tok in ("bigram", "ws+bigram"):
        for p in (0.5, 0.8):
            grid.append({"family": "VC.vehicle+category-all", "name": f"veh-cat-all-{tok}-p{p}", **CURRENT_V17,
                         "tokenizer": tok, "constraintPenalty": p, "vehicleConstraint": True, "vehiclePenalty": p,
                         "categoryMode": "all"})
    return grid


GRIDS = {"default": build_grid, "root-cause": build_root_cause_grid, "query-understanding": build_query_understanding_grid,
         "vehicle-intent": build_vehicle_intent_grid}
# 그리드별 비교 기준 구성
GRID_BASELINES = {"query-understanding": CURRENT_NAME, "vehicle-intent": CURRENT_V17_NAME}


def split_queries(queries: list[dict[str, Any]]) -> dict[str, str]:
    """(source, qtype)별로 qid의 sha256 순서로 정렬한 뒤 dev/test를 번갈아 배정한다.
    v1 질의에는 source가 없으므로 v1 분할은 qtype별 층화 그대로다."""
    assignment: dict[str, str] = {}
    strata = sorted({(q.get("source", ""), q["qtype"]) for q in queries})
    for source, qtype in strata:
        members = sorted((q["id"] for q in queries if q.get("source", "") == source and q["qtype"] == qtype),
                         key=lambda qid: hashlib.sha256(qid.encode()).hexdigest())
        for i, qid in enumerate(members):
            assignment[qid] = "dev" if i % 2 == 0 else "test"
    return assignment


def _scores(run_rows, queries, qrels, qids: set[str]) -> dict[str, Any]:
    sub_q = [q for q in queries if q["id"] in qids]
    sub_r = [r for r in qrels if r["qid"] in qids]
    return evaluate(run_rows, sub_q, sub_r)


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", default="v1")
    parser.add_argument("--grid", default="default", choices=sorted(GRIDS))
    parser.add_argument("--holdout", action="store_true", help="모든 질의를 test로 쓰고 선택 없이 기준과 비교")
    args = parser.parse_args()
    baseline = GRID_BASELINES.get(args.grid, BASELINE)
    dataset = args.dataset
    dataset_dir = EVAL_DIR / "datasets" / dataset
    queries = _read_jsonl(dataset_dir / "queries.jsonl")
    qrels = _read_jsonl(dataset_dir / "qrels.jsonl")
    split = split_queries(queries)
    dev = {q for q, s in split.items() if s == "dev"}
    test = {q for q, s in split.items() if s == "test"}
    grid = GRIDS[args.grid]()

    import shutil
    import subprocess

    with tempfile.TemporaryDirectory() as tmp:
        grid_file = Path(tmp) / "grid.json"
        grid_file.write_text(json.dumps(grid), encoding="utf-8")
        out_dir = Path(tmp) / "runs"
        result = subprocess.run(
            [shutil.which("npx"), "tsx", "eval/ts/experiment-cli.ts", "--dataset", f"eval/datasets/{dataset}",
             "--configs", str(grid_file), "--out-dir", str(out_dir)],
            cwd=REPO_ROOT, capture_output=True, text=True, encoding="utf-8",
        )
        if result.returncode != 0:
            raise SystemExit(f"experiment-cli failed:\n{result.stderr.strip()}")
        runs = {c["name"]: _read_jsonl(out_dir / f"{c['name']}.jsonl") for c in grid}

    if args.holdout:
        write_holdout_report(dataset, args.grid, baseline, grid, runs, queries, qrels)
        return

    rows = []
    per_query: dict[str, dict[str, Any]] = {}
    for c in grid:
        d = _scores(runs[c["name"]], queries, qrels, dev)
        t = _scores(runs[c["name"]], queries, qrels, test)
        per_query[c["name"]] = {r["qid"]: r for r in d["per_query"] + t["per_query"]}
        rows.append({**c, "dev": d["groups"]["overall"], "test": t["groups"]["overall"],
                     "dev_by_type": {k: v for k, v in d["groups"].items() if k.startswith("qtype=")}})

    # dev 기준 선택: 계열별 최고와 전체 최고
    best_by_family: dict[str, dict[str, Any]] = {}
    for r in rows:
        f = r["family"]
        if f not in best_by_family or r["dev"]["ndcg@10"] > best_by_family[f]["dev"]["ndcg@10"]:
            best_by_family[f] = r
    overall_best = max(rows, key=lambda r: r["dev"]["ndcg@10"])

    # test 확인: 선택된 구성 vs 프로덕션 기준 구성 (질의별 쌍체)
    test_ids = sorted(test)
    base_scores = [per_query[baseline][q]["ndcg@10"] for q in test_ids]
    confirmations = {}
    for r in {**best_by_family, "overall": overall_best}.values():
        cand = [per_query[r["name"]][q]["ndcg@10"] for q in test_ids]
        confirmations[r["name"]] = paired_stats(base_scores, cand)

    report = {
        "meta": {"date": date.today().isoformat(), "commit": _git_commit(), "baseline": baseline, "dataset": dataset,
                 "grid": args.grid,
                 "dev_queries": len(dev), "test_queries": len(test), "configs": len(grid)},
        "split": split,
        "rows": rows,
        "best_by_family": {f: r["name"] for f, r in best_by_family.items()},
        "overall_best": overall_best["name"],
        "test_confirmation": confirmations,
    }
    suffix = "" if args.grid == "default" else f"-{args.grid}"
    out = EVAL_DIR / "reports" / f"{report['meta']['date']}-{dataset}-experiments{suffix}"
    out.with_suffix(".json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    out.with_suffix(".md").write_text(to_markdown(report), encoding="utf-8")
    print(f"{len(grid)} configs; dev best = {overall_best['name']} "
          f"(dev nDCG@10 {overall_best['dev']['ndcg@10']:.3f}) -> {out.name}.md")


def write_holdout_report(dataset, grid_name, baseline, grid, runs, queries, qrels) -> None:
    all_ids = {q["id"] for q in queries}
    per_query = {c["name"]: {r["qid"]: r for r in _scores(runs[c["name"]], queries, qrels, all_ids)["per_query"]}
                 for c in grid}
    groups = {c["name"]: _scores(runs[c["name"]], queries, qrels, all_ids)["groups"] for c in grid}
    ids = sorted(all_ids)
    base = [per_query[baseline][q]["ndcg@10"] for q in ids]
    rows = []
    for c in grid:
        stats = paired_stats(base, [per_query[c["name"]][q]["ndcg@10"] for q in ids])
        rows.append({**c, "overall": groups[c["name"]]["overall"], "vs_baseline": stats})
    report = {"meta": {"date": date.today().isoformat(), "commit": _git_commit(), "dataset": dataset, "grid": grid_name,
                       "baseline": baseline, "queries": len(ids), "mode": "holdout"}, "rows": rows}
    out = EVAL_DIR / "reports" / f"{report['meta']['date']}-{dataset}-holdout-{grid_name}"
    out.with_suffix(".json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lines = [
        f"# 홀드아웃 확인 ({dataset}, {grid_name})",
        "",
        f"- 날짜 {report['meta']['date']}, 코드 `{report['meta']['commit']}`, 질의 {len(ids)}개 전부 test",
        f"- 기준 구성: `{baseline}`. 구성을 여기서 고르지 않는다. 해석은 결정 기록에 사전 등록한 구성에만 한다",
        "",
        "| 구성 | 계열 | nDCG@10 | Δ | 95% CI | p | 승/패/무 |",
        "|---|---|---:|---:|---|---:|---|",
    ]
    for r in rows:
        st = r["vs_baseline"]
        lines.append(f"| `{r['name']}` | {r['family']} | {r['overall']['ndcg@10']:.3f} | {st['delta']:+.3f} "
                     f"| [{st['ci_low']:+.3f}, {st['ci_high']:+.3f}] | {format_p(st['p_value'])} "
                     f"| {st['wins']}/{st['losses']}/{st['ties']} |")
    out.with_suffix(".md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"holdout: {len(grid)} configs on {len(ids)} queries -> {out.name}.md")


def to_markdown(report: dict[str, Any]) -> str:
    m = report["meta"]
    rows = sorted(report["rows"], key=lambda r: r["dev"]["ndcg@10"], reverse=True)
    base = next(r for r in report["rows"] if r["name"] == m["baseline"])
    lines = [
        f"# 검색 기법 실험 ({m.get('dataset', 'v1')}, 오프라인)",
        "",
        f"- 날짜 {m['date']}, 코드 `{m['commit']}`, 구성 {m['configs']}개",
        f"- 질의 분할: dev {m['dev_queries']}개 / test {m['test_queries']}개 ((source, qtype)별 층화, qid 해시 순 교대 배정)",
        f"- 선택은 dev nDCG@10만 사용. 기준 구성(현재 프로덕션): `{m['baseline']}` "
        f"(dev {base['dev']['ndcg@10']:.3f} / test {base['test']['ndcg@10']:.3f})",
        "- 쿼리 확장(Claude)은 제외. 오프라인 벡터 검색은 정확한 코사인(프로덕션 S3 Vectors는 근사 검색)",
        "",
        "## test 확인: dev에서 고른 구성 vs 현재 프로덕션 (nDCG@10, 질의별 쌍체)",
        "",
        "| 구성 | 선택 근거 | 기준 | 후보 | Δ | 95% CI | p | 승/패/무 |",
        "|---|---|---:|---:|---:|---|---:|---|",
    ]
    reasons: dict[str, list[str]] = {}
    for fam, name in report["best_by_family"].items():
        reasons.setdefault(name, []).append(f"{fam} 최고")
    reasons.setdefault(report["overall_best"], []).append("전체 최고")
    for name, s in report["test_confirmation"].items():
        lines.append(f"| `{name}` | {', '.join(reasons.get(name, []))} | {s['mean_a']:.3f} | {s['mean_b']:.3f} "
                     f"| {s['delta']:+.3f} | [{s['ci_low']:+.3f}, {s['ci_high']:+.3f}] | {format_p(s['p_value'])} "
                     f"| {s['wins']}/{s['losses']}/{s['ties']} |")
    lines += ["", "여러 구성을 동시에 비교했으므로 p값 하나만으로 결론 내리지 않는다. CI와 승/패를 함께 본다.", "",
              "## 전체 구성 (dev nDCG@10 순)", "",
              "| 순위 | 구성 | 계열 | dev nDCG@10 | dev Recall@10 | dev MRR@10 | keyword | mixed | semantic | test nDCG@10 |",
              "|---:|---|---|---:|---:|---:|---:|---:|---:|---:|"]
    for i, r in enumerate(rows, 1):
        bt = r["dev_by_type"]
        lines.append(f"| {i} | `{r['name']}` | {r['family']} | {r['dev']['ndcg@10']:.3f} | {r['dev']['recall@10']:.3f} "
                     f"| {r['dev']['mrr@10']:.3f} | {bt['qtype=keyword']['ndcg@10']:.3f} | {bt['qtype=mixed']['ndcg@10']:.3f} "
                     f"| {bt['qtype=semantic']['ndcg@10']:.3f} | {r['test']['ndcg@10']:.3f} |")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    main()
