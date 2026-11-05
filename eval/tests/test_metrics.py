import math

import pytest

from eecar_eval.metrics import ndcg_at_k, precision_at_k, query_metrics, recall_at_k, reciprocal_rank

GRADES = {"a": 3, "b": 2, "c": 1, "d": 0}


def test_precision_and_recall_count_only_grade_two_or_more():
    ranked = ["c", "a", "x", "b"]
    assert precision_at_k(ranked, GRADES, 2) == 0.5  # a만 정답
    assert recall_at_k(ranked, GRADES, 2) == 0.5  # 정답 {a, b} 중 a
    assert recall_at_k(ranked, GRADES, 4) == 1.0


def test_reciprocal_rank_uses_first_relevant_within_k():
    assert reciprocal_rank(["c", "x", "b"], GRADES, 10) == pytest.approx(1 / 3)
    assert reciprocal_rank(["c", "x", "b"], GRADES, 2) == 0.0


def test_ndcg_matches_hand_computation():
    ranked = ["b", "a", "c"]
    dcg = (2**2 - 1) / math.log2(2) + (2**3 - 1) / math.log2(3) + (2**1 - 1) / math.log2(4)
    ideal = (2**3 - 1) / math.log2(2) + (2**2 - 1) / math.log2(3) + (2**1 - 1) / math.log2(4)
    assert ndcg_at_k(ranked, GRADES, 3) == pytest.approx(dcg / ideal)
    assert ndcg_at_k(["a", "b", "c"], GRADES, 3) == pytest.approx(1.0)


def test_empty_results_are_counted_as_zero_result():
    m = query_metrics([], GRADES)
    assert m["zero_result"] == 1.0
    assert m["ndcg@10"] == 0.0


def test_query_without_relevant_documents_scores_zero():
    assert recall_at_k(["a"], {"a": 1}, 10) == 0.0
    assert ndcg_at_k(["a"], {}, 10) == 0.0
