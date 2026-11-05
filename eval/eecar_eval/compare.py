"""두 시스템의 질의별 지표를 짝지어 비교한다 (paired comparison).

    uv run python -m eecar_eval.compare reports/A.json reports/B.json [--metric ndcg@10]

질의 수가 적으면 평균 차이가 우연일 수 있다. 같은 질의에 대한 차이(B - A)를 기준으로
- 부트스트랩 95% 신뢰구간 (질의를 복원 추출)
- 부호 뒤집기 무작위화 검정 p-value (양측)
을 함께 보고한다. 둘 다 분포 가정이 필요 없어 nDCG처럼 0~1에 몰린 값에도 쓸 수 있다.
반복 횟수 10,000은 p=0.05 근처에서 몬테카를로 표준오차가 약 0.002가 되는 수준이다.
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path
from typing import Any

N_RESAMPLES = 10_000
SEED = 7


def paired_stats(a: list[float], b: list[float], n: int = N_RESAMPLES, seed: int = SEED) -> dict[str, float]:
    if len(a) != len(b) or not a:
        raise ValueError("paired samples must be non-empty and of equal length")
    rng = random.Random(seed)
    deltas = [y - x for x, y in zip(a, b)]
    k = len(deltas)
    observed = sum(deltas) / k

    boot = sorted(sum(deltas[rng.randrange(k)] for _ in range(k)) / k for _ in range(n))
    ci_low, ci_high = boot[int(0.025 * n)], boot[int(0.975 * n) - 1]

    extreme = 0
    for _ in range(n):
        flipped = sum(d if rng.random() < 0.5 else -d for d in deltas) / k
        if abs(flipped) >= abs(observed) - 1e-12:
            extreme += 1
    p_value = (extreme + 1) / (n + 1)

    return {
        "mean_a": sum(a) / k,
        "mean_b": sum(b) / k,
        "delta": observed,
        "ci_low": ci_low,
        "ci_high": ci_high,
        "p_value": p_value,
        "wins": sum(1 for d in deltas if d > 0),
        "losses": sum(1 for d in deltas if d < 0),
        "ties": sum(1 for d in deltas if d == 0),
        "n": k,
    }


def compare_reports(report_a: dict[str, Any], report_b: dict[str, Any], metric: str) -> dict[str, dict[str, float]]:
    rows_a = {r["qid"]: r for r in report_a["per_query"]}
    rows_b = {r["qid"]: r for r in report_b["per_query"]}
    if rows_a.keys() != rows_b.keys():
        raise ValueError("reports cover different queries; compare runs on the same dataset")
    qids = sorted(rows_a)

    groups: dict[str, list[str]] = {"overall": qids}
    for field in ("qtype", "difficulty"):
        for value in sorted({rows_a[q][field] for q in qids}):
            groups[f"{field}={value}"] = [q for q in qids if rows_a[q][field] == value]

    return {
        name: paired_stats([rows_a[q][metric] for q in members], [rows_b[q][metric] for q in members])
        for name, members in groups.items()
    }


def format_p(p: float) -> str:
    """무작위화 검정의 p는 최소 1/(n+1)이므로 0으로 표기하지 않는다."""
    return "<0.001" if p < 0.001 else f"{p:.3f}"


def to_markdown(name_a: str, name_b: str, metric: str, results: dict[str, dict[str, float]]) -> str:
    lines = [
        f"# {name_b} vs {name_a} ({metric}, 질의별 쌍체 비교)",
        "",
        f"Δ = {name_b} − {name_a}. 95% CI는 부트스트랩, p는 부호 뒤집기 무작위화 검정 (각 {N_RESAMPLES:,}회, seed {SEED}).",
        "",
        f"| 구분 | 질의 수 | {name_a} | {name_b} | Δ | 95% CI | p | 승/패/무 |",
        "|---|---:|---:|---:|---:|---|---:|---|",
    ]
    for group, s in results.items():
        lines.append(
            f"| {group} | {s['n']} | {s['mean_a']:.3f} | {s['mean_b']:.3f} | {s['delta']:+.3f} "
            f"| [{s['ci_low']:+.3f}, {s['ci_high']:+.3f}] | {format_p(s['p_value'])} | {s['wins']}/{s['losses']}/{s['ties']} |"
        )
    lines += ["", "해석 주의: 그룹별 검정은 여러 번 수행한 것이라 개별 p값을 그대로 유의성 판단에 쓰지 않는다 (다중 비교)."]
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("baseline", type=Path)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("--metric", default="ndcg@10")
    args = parser.parse_args()

    report_a = json.loads(args.baseline.read_text(encoding="utf-8"))
    report_b = json.loads(args.candidate.read_text(encoding="utf-8"))
    name_a, name_b = report_a["meta"]["system"], report_b["meta"]["system"]
    results = compare_reports(report_a, report_b, args.metric)

    out = args.candidate.parent / f"compare-{report_b['meta']['dataset']}-{name_b}-vs-{name_a}-{args.metric.replace('@', '')}.md"
    out.write_text(to_markdown(name_a, name_b, args.metric, results), encoding="utf-8")
    s = results["overall"]
    print(f"{name_b} vs {name_a} {args.metric}: Δ={s['delta']:+.3f} 95%CI=[{s['ci_low']:+.3f},{s['ci_high']:+.3f}] "
          f"p={format_p(s['p_value'])} -> {out.name}")


if __name__ == "__main__":
    main()
