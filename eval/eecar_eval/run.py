"""검색 시스템을 데이터셋에 대해 실행하고 지표 리포트를 만든다.

    uv run python -m eecar_eval.run --system bm25
    uv run python -m eecar_eval.run --system prod-hybrid      # 임베딩 캐시 필요
    uv run python -m eecar_eval.run --run-file run.jsonl --label my-system

리포트: eval/reports/<날짜>-<dataset>-<system>[-<tag>].{json,md}
--tag: 같은 날 검색 코드를 바꿔 다시 잴 때 이전 리포트를 덮어쓰지 않도록 붙이는 이름
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import tempfile
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any

from .metrics import mean, query_metrics

EVAL_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = EVAL_DIR.parent
SYSTEMS = ("bm25", "vector", "prod-hybrid", "legacy-hybrid")
# v2 질의에만 있는 분류 필드. 있으면 이 기준으로도 지표를 나눠 집계한다
OPTIONAL_GROUP_FIELDS = ("source", "segment", "form")
METRICS = ("ndcg@10", "recall@10", "mrr@10", "p@5", "zero_result")


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def run_search_cli(system: str, dataset_dir: Path, out: Path) -> None:
    npx = shutil.which("npx")
    if npx is None:
        raise SystemExit("npx not found: install Node.js dependencies at the repository root")
    cmd = [
        npx, "tsx", "eval/ts/search-cli.ts",
        "--mode", system,
        "--dataset", str(dataset_dir.relative_to(REPO_ROOT)),
        "--out", str(out),
    ]
    result = subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True, encoding="utf-8")
    if result.returncode != 0:
        raise SystemExit(f"search-cli failed:\n{result.stderr.strip()}")


def _git_commit() -> str:
    result = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=REPO_ROOT, capture_output=True, text=True)
    dirty = subprocess.run(["git", "status", "--porcelain", "backend/src"], cwd=REPO_ROOT, capture_output=True, text=True)
    commit = result.stdout.strip() or "unknown"
    return f"{commit}-dirty" if dirty.stdout.strip() else commit


def evaluate(run_rows: list[dict[str, Any]], queries: list[dict[str, Any]], qrels_rows: list[dict[str, Any]]) -> dict[str, Any]:
    grades: dict[str, dict[str, int]] = defaultdict(dict)
    for row in qrels_rows:
        grades[row["qid"]][row["partId"]] = row["grade"]
    ranked = {row["qid"]: [r["partId"] for r in row["results"]] for row in run_rows}

    per_query = []
    for q in queries:
        m = query_metrics(ranked.get(q["id"], []), grades[q["id"]])
        per_query.append({"qid": q["id"], "text": q["text"], "qtype": q["qtype"], "difficulty": q["difficulty"],
                          **{f: q[f] for f in OPTIONAL_GROUP_FIELDS if q.get(f)},
                          "top5": ranked.get(q["id"], [])[:5], **m})

    def aggregate(rows: list[dict[str, Any]]) -> dict[str, float]:
        return {"queries": len(rows), **{k: round(mean([r[k] for r in rows]), 4) for k in METRICS}}

    groups: dict[str, dict[str, Any]] = {"overall": aggregate(per_query)}
    for field in ("qtype", "difficulty", *OPTIONAL_GROUP_FIELDS):
        for value in sorted({r[field] for r in per_query if r.get(field)}):
            groups[f"{field}={value}"] = aggregate([r for r in per_query if r.get(field) == value])
    return {"groups": groups, "per_query": per_query}


def to_markdown(report: dict[str, Any]) -> str:
    meta = report["meta"]
    lines = [
        f"# 검색 평가: {meta['system']} ({meta['dataset']})",
        "",
        f"- 날짜: {meta['date']} / 코드: `{meta['commit']}` / 코퍼스 sha256: `{meta['corpus_sha256'][:12]}`",
        f"- 문서 {meta['documents']}개, 질의 {meta['queries']}개. 정답 기준: 등급 2 이상, nDCG는 등급(0~3) 사용",
        "",
        "| 구분 | 질의 수 | nDCG@10 | Recall@10 | MRR@10 | P@5 | 결과 0건 비율 |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for name, g in report["groups"].items():
        lines.append(
            f"| {name} | {g['queries']} | {g['ndcg@10']:.3f} | {g['recall@10']:.3f} | {g['mrr@10']:.3f} "
            f"| {g['p@5']:.3f} | {g['zero_result']:.3f} |"
        )
    failures = [r for r in report["per_query"] if r["ndcg@10"] == 0]
    lines += ["", f"## nDCG@10 = 0 인 질의 ({len(failures)}개)", ""]
    lines += [f"- `{r['qid']}` [{r['qtype']}/{r['difficulty']}] {r['text']} → 상위 5: {', '.join(r['top5']) or '(결과 없음)'}"
              for r in failures]
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", default="v1")
    parser.add_argument("--system", choices=SYSTEMS)
    parser.add_argument("--run-file", type=Path, help="이미 만들어진 run JSONL을 평가 (예: staging HTTP 실행 결과)")
    parser.add_argument("--label", help="리포트에 쓸 시스템 이름 (--run-file과 함께 사용)")
    parser.add_argument("--tag", help="리포트 파일 이름 끝에 붙일 이름 (예: fusion-v2)")
    args = parser.parse_args()
    if not args.system and not args.run_file:
        parser.error("--system 또는 --run-file 중 하나가 필요합니다")

    dataset_dir = EVAL_DIR / "datasets" / args.dataset
    manifest = json.loads((dataset_dir / "manifest.json").read_text(encoding="utf-8"))
    queries = _read_jsonl(dataset_dir / "queries.jsonl")
    qrels_rows = _read_jsonl(dataset_dir / "qrels.jsonl")

    if args.run_file:
        run_rows = _read_jsonl(args.run_file)
        system = args.label or args.run_file.stem
    else:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "run.jsonl"
            run_search_cli(args.system, dataset_dir, out)
            run_rows = _read_jsonl(out)
        system = args.system

    result = evaluate(run_rows, queries, qrels_rows)
    report = {
        "meta": {
            "system": system,
            "dataset": args.dataset,
            "tag": args.tag,
            "date": date.today().isoformat(),
            "commit": _git_commit(),
            "corpus_sha256": manifest["sha256"]["corpus.jsonl"],
            "documents": manifest["documents"],
            "queries": manifest["queries"],
        },
        **result,
    }

    reports_dir = EVAL_DIR / "reports"
    reports_dir.mkdir(exist_ok=True)
    stem = f"{report['meta']['date']}-{args.dataset}-{system}" + (f"-{args.tag}" if args.tag else "")
    (reports_dir / f"{stem}.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (reports_dir / f"{stem}.md").write_text(to_markdown(report), encoding="utf-8")
    overall = report["groups"]["overall"]
    print(f"{system}: nDCG@10={overall['ndcg@10']:.3f} Recall@10={overall['recall@10']:.3f} "
          f"MRR@10={overall['mrr@10']:.3f} zero_result={overall['zero_result']:.3f} -> reports/{stem}.md")


if __name__ == "__main__":
    main()
