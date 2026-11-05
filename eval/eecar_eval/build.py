"""데이터셋 v1 파일 생성: corpus.jsonl, queries.jsonl, qrels.jsonl

    uv run python -m eecar_eval.build
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

from .corpus import build_corpus
from .queries import QUERIES
from .relevance import grade

DATASET_DIR = Path(__file__).resolve().parent.parent / "datasets" / "v1"

# 질의 하나에 정답(등급 2 이상)이 너무 많으면 Recall@10이 구조적으로 낮아져 지표가 왜곡된다
MAX_RELEVANT_PER_QUERY = 25


def build_qrels(corpus: list[dict[str, Any]]) -> list[dict[str, Any]]:
    qrels = []
    for q in QUERIES:
        for record in corpus:
            g = grade(record["attrs"], q.must, q.should)
            if g > 0:
                qrels.append({"qid": q.id, "partId": record["part"]["partId"], "grade": g})
    return qrels


def validate(corpus: list[dict[str, Any]], qrels: list[dict[str, Any]]) -> list[str]:
    problems = []
    ids = [r["part"]["partId"] for r in corpus]
    if len(ids) != len(set(ids)):
        problems.append("duplicate partId")
    for q in QUERIES:
        grades = [r["grade"] for r in qrels if r["qid"] == q.id]
        if 3 not in grades:
            problems.append(f"{q.id} '{q.text}': no grade-3 document")
        relevant = sum(1 for g in grades if g >= 2)
        if relevant > MAX_RELEVANT_PER_QUERY:
            problems.append(f"{q.id} '{q.text}': {relevant} relevant documents (> {MAX_RELEVANT_PER_QUERY})")
    return problems


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> str:
    text = "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows)
    path.write_text(text, encoding="utf-8", newline="\n")
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def main() -> None:
    corpus = build_corpus()
    qrels = build_qrels(corpus)
    problems = validate(corpus, qrels)
    if problems:
        raise SystemExit("dataset validation failed:\n  " + "\n  ".join(problems))

    DATASET_DIR.mkdir(parents=True, exist_ok=True)
    digests = {
        "corpus.jsonl": _write_jsonl(DATASET_DIR / "corpus.jsonl", corpus),
        "queries.jsonl": _write_jsonl(DATASET_DIR / "queries.jsonl", [asdict(q) for q in QUERIES]),
        "qrels.jsonl": _write_jsonl(DATASET_DIR / "qrels.jsonl", qrels),
    }
    manifest = {
        "version": "v1",
        "documents": len(corpus),
        "queries": len(QUERIES),
        "judgments": len(qrels),
        "sha256": digests,
    }
    (DATASET_DIR / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
