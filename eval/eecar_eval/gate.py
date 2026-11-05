"""검색 품질 회귀 게이트. 지표가 기준값보다 허용치 이상 떨어지면 실패한다.

    uv run python -m eecar_eval.gate --system bm25            # 비교 (CI)
    uv run python -m eecar_eval.gate --system bm25 --update   # 의도한 변경 후 기준값 갱신

기준값은 baselines/<dataset>-<system>.json 에 커밋한다. 개선이든 하락이든 지표가 바뀌면
기준값 파일의 diff로 리뷰에 드러나게 하는 것이 목적이다.
"""

from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path

from .run import EVAL_DIR, _read_jsonl, evaluate, run_search_cli

GATED_METRICS = ("ndcg@10", "recall@10", "mrr@10")


def current_metrics(dataset: str, system: str) -> dict[str, dict[str, float]]:
    dataset_dir = EVAL_DIR / "datasets" / dataset
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "run.jsonl"
        run_search_cli(system, dataset_dir, out)
        run_rows = _read_jsonl(out)
    groups = evaluate(run_rows, _read_jsonl(dataset_dir / "queries.jsonl"), _read_jsonl(dataset_dir / "qrels.jsonl"))["groups"]
    return {name: {k: g[k] for k in GATED_METRICS} for name, g in groups.items()}


def compare(baseline: dict[str, dict[str, float]], current: dict[str, dict[str, float]], tolerance: float) -> list[str]:
    regressions = []
    for group, metrics in baseline.items():
        for metric, expected in metrics.items():
            actual = current.get(group, {}).get(metric)
            if actual is None or actual < expected - tolerance:
                regressions.append(f"{group} {metric}: {expected:.4f} -> {actual if actual is None else f'{actual:.4f}'}")
    return regressions


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", default="v1")
    parser.add_argument("--system", default="bm25")
    parser.add_argument("--tolerance", type=float, default=0.01)
    parser.add_argument("--update", action="store_true", help="현재 결과로 기준값 파일을 갱신")
    args = parser.parse_args()

    baseline_path = EVAL_DIR / "baselines" / f"{args.dataset}-{args.system}.json"
    current = current_metrics(args.dataset, args.system)

    if args.update:
        baseline_path.parent.mkdir(exist_ok=True)
        baseline_path.write_text(json.dumps(current, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"baseline updated: {baseline_path.relative_to(EVAL_DIR)}")
        return

    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    regressions = compare(baseline, current, args.tolerance)
    improved = [
        f"{g} {m}: {baseline[g][m]:.4f} -> {current[g][m]:.4f}"
        for g in baseline for m in baseline[g]
        if g in current and current[g][m] > baseline[g][m] + args.tolerance
    ]
    if improved:
        print("improved (run with --update to record):\n  " + "\n  ".join(improved))
    if regressions:
        raise SystemExit(f"search quality regression (tolerance {args.tolerance}):\n  " + "\n  ".join(regressions))
    print(f"search quality gate passed for {args.dataset}-{args.system}")


if __name__ == "__main__":
    main()
