"""검색 LLM 후보 모델 실측 결과를 리포트로 정리한다.

    uv run python -m eecar_eval.llm_candidates

입력: reports/llm-candidates/ 의 원시 측정 (eval/ts/llm-candidates.ts 출력)
      reports/<날짜>-v1-<label>-exp-run<N>.json (run.py로 채점한 확장 run)
      reports/2026-11-05-v1-prod-hybrid.json (확장 없는 기준 = 현재 프로덕션이 실제로 내는 결과)
출력: reports/<날짜>-v1-llm-candidates.md / .json
"""

from __future__ import annotations

import json
import statistics
from datetime import date
from pathlib import Path
from typing import Any

from .compare import format_p, paired_stats
from .run import EVAL_DIR

RAW = EVAL_DIR / "reports" / "llm-candidates"
BASELINE_REPORT = EVAL_DIR / "reports" / "2026-11-05-v1-prod-hybrid.json"

# USD / 1M tokens. 출처: Bedrock 약정 offer 요금표 (list_foundation_model_agreement_offers, APN2 Global 행)
PRICES = {
    "haiku-4.5": {"modelId": "global.anthropic.claude-haiku-4-5-20251001-v1:0", "input": 1.0, "output": 5.0},
    "sonnet-4.6": {"modelId": "global.anthropic.claude-sonnet-4-6", "input": 3.0, "output": 15.0},
}
TITAN_PER_1M = 0.024592  # APN2 Titan v2 on-demand, AWS Price List (DECISION_LOG E-10)


def _jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]


def _pct(values: list[float], q: float) -> float:
    s = sorted(values)
    return s[min(len(s) - 1, int(round(q * (len(s) - 1))))]


def _call_stats(rows: list[dict[str, Any]], ok_key: str) -> dict[str, Any]:
    done = [r for r in rows if r.get("latencyMs") is not None]
    lat = [r["latencyMs"] for r in done]
    return {
        "n": len(rows),
        "ok": sum(1 for r in rows if r.get(ok_key)),
        "failed_calls": len(rows) - len(done),
        "latency_p50": statistics.median(lat) if lat else None,
        "latency_p95": _pct(lat, 0.95) if lat else None,
        "in_tokens_mean": statistics.mean(r["inputTokens"] for r in done) if done else 0,
        "out_tokens_mean": statistics.mean(r["outputTokens"] for r in done) if done else 0,
    }


def _ndcg_by_qid(report_path: Path) -> dict[str, float]:
    report = json.loads(report_path.read_text(encoding="utf-8"))
    return {r["qid"]: r["ndcg@10"] for r in report["per_query"]}


def main() -> None:
    baseline = _ndcg_by_qid(BASELINE_REPORT)
    qids = sorted(baseline)
    models: dict[str, Any] = {}

    for label, price in PRICES.items():
        runs = sorted(RAW.glob(f"{label}-run*-expansion.jsonl"))
        if not runs:
            continue
        m: dict[str, Any] = {"modelId": price["modelId"], "runs": []}
        for raw in runs:
            run_name = raw.name.replace("-expansion.jsonl", "")  # e.g. haiku-4.5-run1
            rows = _jsonl(raw)
            scored = next((EVAL_DIR / "reports").glob(f"*-v1-{label}-exp-{run_name.split('-')[-1]}.json"))
            ndcg = _ndcg_by_qid(scored)
            stats = paired_stats([baseline[q] for q in qids], [ndcg[q] for q in qids])
            titan_tokens_note = sum(r.get("titanCalls", 0) for r in rows)
            m["runs"].append({
                "run": run_name,
                "expansion": _call_stats(rows, "parsed"),
                "ndcg_with_expansion": stats["mean_b"],
                "vs_no_expansion": stats,
                "titan_calls": titan_tokens_note,
                "expansions": {r["qid"]: r["queries"] for r in rows},
                "ndcg_by_qid": ndcg,
            })
        explain_path = RAW / f"{label}-explain.jsonl"
        if explain_path.exists():
            m["explanation"] = _call_stats(_jsonl(explain_path), "ok")
        converse_path = RAW / f"{label}-converse.json"
        if converse_path.exists():
            m["converse_temperature"] = json.loads(converse_path.read_text(encoding="utf-8"))

        e = m["runs"][0]["expansion"]
        x = m.get("explanation", {"in_tokens_mean": 0, "out_tokens_mean": 0})
        per_search = (
            (e["in_tokens_mean"] + x["in_tokens_mean"]) * price["input"]
            + (e["out_tokens_mean"] + x["out_tokens_mean"]) * price["output"]
        ) / 1e6
        m["usd_per_1k_searches"] = per_search * 1000
        models[label] = m

    # 같은 모델 반복 실행 간 차이 (확장 결과가 비결정적이라 생기는 분산)
    variance = {}
    for label, m in models.items():
        if len(m["runs"]) >= 2:
            a, b = m["runs"][0], m["runs"][1]
            same = sum(1 for q in qids if a["expansions"].get(q) == b["expansions"].get(q))
            variance[label] = {
                "identical_expansions": same,
                "queries": len(qids),
                "run1_vs_run2": paired_stats([a["ndcg_by_qid"][q] for q in qids], [b["ndcg_by_qid"][q] for q in qids]),
            }

    report = {"date": date.today().isoformat(), "baseline": BASELINE_REPORT.name, "models": models, "variance": variance}
    out = EVAL_DIR / "reports" / f"{report['date']}-v1-llm-candidates"
    slim = json.loads(json.dumps(report))
    for m in slim["models"].values():
        for r in m["runs"]:
            r.pop("ndcg_by_qid", None)
    out.with_suffix(".json").write_text(json.dumps(slim, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    out.with_suffix(".md").write_text(to_markdown(report), encoding="utf-8")
    print(f"wrote {out.name}.md")


def _ms(v: float | None) -> str:
    return "-" if v is None else f"{v / 1000:.2f}s"


def to_markdown(report: dict[str, Any]) -> str:
    base = json.loads(BASELINE_REPORT.read_text(encoding="utf-8"))["groups"]["overall"]["ndcg@10"]
    lines = [
        "# 검색 LLM 후보 모델 실측 (v1)",
        "",
        f"- 날짜 {report['date']}. 프로덕션 코드 경로(search-llm.ts 프롬프트·파싱, invokeClaude, Titan 평균 임베딩, prod-hybrid)를 그대로 사용",
        "- 호출 간격: 분당 40회로 제한 (계정 쿼터: global cross-region 분당 요청 50)",
        f"- 비교 기준: 확장 없는 prod-hybrid (nDCG@10 {base:.3f}). 레거시 모델 차단 이후 프로덕션이 실제로 내는 결과다(확장이 폴백됨)",
        "- 단가 (USD/1M 토큰, Bedrock 약정 offer 요금표 APN2 Global): Haiku 4.5 입력 1·출력 5, Sonnet 4.6 입력 3·출력 15",
        "",
        "## 쿼리 확장 (질의 91개)",
        "",
        "| 모델·실행 | 파싱 성공 | 호출 실패 | 지연 p50 | 지연 p95 | 입력/출력 토큰 | nDCG@10 (확장) | Δ vs 확장 없음 | 95% CI | p |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---|---:|",
    ]
    for label, m in report["models"].items():
        for r in m["runs"]:
            e, s = r["expansion"], r["vs_no_expansion"]
            lines.append(
                f"| {r['run']} | {e['ok']}/{e['n']} | {e['failed_calls']} | {_ms(e['latency_p50'])} | {_ms(e['latency_p95'])} "
                f"| {e['in_tokens_mean']:.0f}/{e['out_tokens_mean']:.0f} | {r['ndcg_with_expansion']:.3f} | {s['delta']:+.3f} "
                f"| [{s['ci_low']:+.3f}, {s['ci_high']:+.3f}] | {format_p(s['p_value'])} |"
            )
    if report["variance"]:
        lines += ["", "### 같은 모델을 다시 실행했을 때의 차이 (확장 결과 비결정성)", ""]
        for label, v in report["variance"].items():
            s = v["run1_vs_run2"]
            lines.append(
                f"- {label}: 확장 결과가 두 번 모두 같은 질의 {v['identical_expansions']}/{v['queries']}개, "
                f"nDCG@10 차이(run2 − run1) {s['delta']:+.3f} [{s['ci_low']:+.3f}, {s['ci_high']:+.3f}]"
            )
    lines += [
        "",
        "## 결과 설명 (질의 20개 표본, 모든 모델에 같은 입력: 확장 없는 prod-hybrid 상위 10)",
        "",
        "| 모델 | 정확히 10개 파싱 | 호출 실패 | 지연 p50 | 지연 p95 | 입력/출력 토큰 |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for label, m in report["models"].items():
        x = m.get("explanation")
        if x:
            lines.append(f"| {label} | {x['ok']}/{x['n']} | {x['failed_calls']} | {_ms(x['latency_p50'])} | {_ms(x['latency_p95'])} "
                         f"| {x['in_tokens_mean']:.0f}/{x['out_tokens_mean']:.0f} |")
    lines += ["", "## 비용과 호환성", "", "| 모델 | 1천 검색당 LLM 비용 (확장+설명, 캐시 미적중 기준) | Converse + temperature |", "|---|---:|---|"]
    for label, m in report["models"].items():
        c = m.get("converse_temperature", {})
        lines.append(f"| {label} | ${m['usd_per_1k_searches']:.2f} | {'허용' if c.get('ok') else '거부: ' + str(c.get('error', '-'))[:80]} |")
    notes = RAW / "notes.md"  # 사람이 쓴 해석. 수치가 바뀌면 함께 갱신한다
    if notes.exists():
        lines += ["", notes.read_text(encoding="utf-8").strip()]
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    main()
