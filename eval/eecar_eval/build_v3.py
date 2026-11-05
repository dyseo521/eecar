"""데이터셋 v3 생성: 블라인드 홀드아웃 질의 160개 + v2와 같은 부품 300개.

    uv run python -m eecar_eval.build_v3

질의(datasets/v3/source_queries.jsonl)는 검색 코드·조건 추출 규칙·기존 질의를 보지 않은 별도 에이전트가
DEMAND_RESEARCH.md(v2)의 세그먼트·형태 비율에 맞춰 썼다(DECISION_LOG E-25, E-26).
v3는 구성 선택에 쓰지 않는다. 다른 데이터셋의 dev에서 고르고 결정 기록에 사전 등록한 구성만 여기서 확인한다.
"""

from __future__ import annotations

import json
from pathlib import Path

from .build_v2 import V2_DIR, _write_jsonl, build_qrels, validate
from .queries_v2 import MAX_RELEVANT_PER_QUERY_V2

V3_DIR = Path(__file__).resolve().parent.parent / "datasets" / "v3"
SOURCE = V3_DIR / "source_queries.jsonl"


def load_queries() -> list[dict]:
    rows = [json.loads(line) for line in SOURCE.read_text(encoding="utf-8").splitlines() if line.strip()]
    return [{**r, "source": "holdout-blind"} for r in rows]


def main() -> None:
    corpus = [json.loads(line) for line in (V2_DIR / "corpus.jsonl").read_text(encoding="utf-8").splitlines()]
    queries = load_queries()
    qrels = build_qrels(corpus, queries)
    problems = validate(corpus, queries, qrels)
    if problems:
        raise SystemExit("v3 validation failed:\n  " + "\n  ".join(problems))

    digests = {
        "corpus.jsonl": _write_jsonl(V3_DIR / "corpus.jsonl", corpus),
        "queries.jsonl": _write_jsonl(V3_DIR / "queries.jsonl", queries),
        "qrels.jsonl": _write_jsonl(V3_DIR / "qrels.jsonl", qrels),
    }
    manifest = {"version": "v3", "documents": len(corpus), "queries": len(queries),
                "queries_by_source": {"holdout-blind": len(queries)}, "judgments": len(qrels),
                "max_relevant_per_query": MAX_RELEVANT_PER_QUERY_V2, "sha256": digests}
    (V3_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                                          encoding="utf-8", newline="\n")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
