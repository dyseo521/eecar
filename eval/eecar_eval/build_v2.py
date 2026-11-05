"""데이터셋 v2 생성: v1과 같은 부품 300개 + 수요 근거 질의 + v1 질의.

    uv run python -m eecar_eval.build_v2

- 코퍼스: v1의 부품을 그대로 쓴다(문서 임베딩 재사용, v1과 직접 비교 가능). 거래 조건 판정을 위해
  part의 가격·수량·상태·연식을 attrs로 복사한다. 검색 시스템이 보는 part는 바뀌지 않는다.
- 질의: queries_v2.DEMAND_QUERIES(source="demand-persona", 근거는 datasets/v2/DEMAND_RESEARCH.md)와
  v1 질의(source="v1-generated")를 함께 둔다. 리포트는 source별로 나눠 본다.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from .build import DATASET_DIR as V1_DIR
from .queries import QUERIES as V1_QUERIES
from .queries_v2 import DEMAND_QUERIES, MAX_RELEVANT_PER_QUERY_V2
from .relevance import grade

V2_DIR = Path(__file__).resolve().parent.parent / "datasets" / "v2"


def augmented_corpus() -> list[dict[str, Any]]:
    records = [json.loads(line) for line in (V1_DIR / "corpus.jsonl").read_text(encoding="utf-8").splitlines()]
    for r in records:
        part = r["part"]
        r["attrs"].update({
            "price": part["price"],
            "quantity": part["quantity"],
            "condition": part["condition"],
            "year": r["attrs"].get("year") or part["year"],
        })
    return records


def all_queries() -> list[dict[str, Any]]:
    demand = [{**q.to_dict(), "source": "demand-persona"} for q in DEMAND_QUERIES]
    v1 = [{"id": q.id, "text": q.text, "qtype": q.qtype, "difficulty": q.difficulty, "source": "v1-generated",
           "segment": "v1", "form": "v1", "must": q.must, "should": q.should, "unanswerable": []}
          for q in V1_QUERIES]
    return demand + v1


def build_qrels(corpus: list[dict[str, Any]], queries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for q in queries:
        for record in corpus:
            g = grade(record["attrs"], q["must"], q["should"])
            if g > 0:
                rows.append({"qid": q["id"], "partId": record["part"]["partId"], "grade": g})
    return rows


def validate(corpus, queries, qrels) -> list[str]:
    problems = []
    ids = [q["id"] for q in queries]
    if len(ids) != len(set(ids)):
        problems.append("duplicate query id")
    for q in queries:
        grades = [r["grade"] for r in qrels if r["qid"] == q["id"]]
        if 3 not in grades:
            problems.append(f"{q['id']} '{q['text']}': no grade-3 document")
        relevant = sum(1 for g in grades if g >= 2)
        # 탐색형(G) 질의는 원래 정답이 많은 질의라 상한을 적용하지 않는다 (DECISION_LOG E-21)
        if q.get("segment") != "G-browse" and relevant > MAX_RELEVANT_PER_QUERY_V2:
            problems.append(f"{q['id']} '{q['text']}': {relevant} relevant (> {MAX_RELEVANT_PER_QUERY_V2})")
    return problems


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> str:
    text = "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows)
    path.write_text(text, encoding="utf-8", newline="\n")
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def main() -> None:
    corpus = augmented_corpus()
    queries = all_queries()
    qrels = build_qrels(corpus, queries)
    problems = validate(corpus, queries, qrels)
    if problems:
        raise SystemExit("v2 validation failed:\n  " + "\n  ".join(problems))

    V2_DIR.mkdir(parents=True, exist_ok=True)
    digests = {
        "corpus.jsonl": _write_jsonl(V2_DIR / "corpus.jsonl", corpus),
        "queries.jsonl": _write_jsonl(V2_DIR / "queries.jsonl", queries),
        "qrels.jsonl": _write_jsonl(V2_DIR / "qrels.jsonl", qrels),
    }
    by_source: dict[str, int] = {}
    for q in queries:
        by_source[q["source"]] = by_source.get(q["source"], 0) + 1
    manifest = {"version": "v2", "documents": len(corpus), "queries": len(queries), "queries_by_source": by_source,
                "judgments": len(qrels), "sha256": digests}
    (V2_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                                          encoding="utf-8", newline="\n")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
