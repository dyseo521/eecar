"""검색 지표. 등급 2 이상을 '정답'으로 보고, nDCG는 등급(0~3)을 그대로 이득으로 쓴다."""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence

RELEVANT_GRADE = 2


def _relevant(grades: Mapping[str, int]) -> set[str]:
    return {doc for doc, g in grades.items() if g >= RELEVANT_GRADE}


def precision_at_k(ranked: Sequence[str], grades: Mapping[str, int], k: int) -> float:
    relevant = _relevant(grades)
    return sum(1 for doc in ranked[:k] if doc in relevant) / k


def recall_at_k(ranked: Sequence[str], grades: Mapping[str, int], k: int) -> float:
    relevant = _relevant(grades)
    if not relevant:
        return 0.0
    return sum(1 for doc in ranked[:k] if doc in relevant) / len(relevant)


def reciprocal_rank(ranked: Sequence[str], grades: Mapping[str, int], k: int) -> float:
    relevant = _relevant(grades)
    for i, doc in enumerate(ranked[:k]):
        if doc in relevant:
            return 1.0 / (i + 1)
    return 0.0


def _dcg(gains: Sequence[int]) -> float:
    return sum((2**g - 1) / math.log2(i + 2) for i, g in enumerate(gains))


def ndcg_at_k(ranked: Sequence[str], grades: Mapping[str, int], k: int) -> float:
    ideal = _dcg(sorted(grades.values(), reverse=True)[:k])
    if ideal == 0:
        return 0.0
    return _dcg([grades.get(doc, 0) for doc in ranked[:k]]) / ideal


def query_metrics(ranked: Sequence[str], grades: Mapping[str, int]) -> dict[str, float]:
    return {
        "ndcg@10": ndcg_at_k(ranked, grades, 10),
        "recall@10": recall_at_k(ranked, grades, 10),
        "mrr@10": reciprocal_rank(ranked, grades, 10),
        "p@5": precision_at_k(ranked, grades, 5),
        "zero_result": 1.0 if len(ranked) == 0 else 0.0,
    }


def mean(values: Sequence[float]) -> float:
    return sum(values) / len(values) if values else 0.0
