import pytest

from eecar_eval.compare import compare_reports, paired_stats


def test_identical_systems_have_zero_delta_and_no_evidence_of_difference():
    s = paired_stats([0.5, 0.7, 0.9], [0.5, 0.7, 0.9], n=2000)
    assert s["delta"] == 0
    assert s["ci_low"] == 0 and s["ci_high"] == 0
    assert s["p_value"] == 1.0
    assert (s["wins"], s["losses"], s["ties"]) == (0, 0, 3)


def test_consistent_improvement_is_detected():
    a = [0.2] * 30
    b = [0.6] * 30
    s = paired_stats(a, b, n=2000)
    assert s["delta"] == pytest.approx(0.4)
    assert s["ci_low"] > 0
    assert s["p_value"] < 0.01


def test_mixed_small_differences_are_not_significant():
    a = [0.5, 0.6, 0.4, 0.7, 0.5, 0.6]
    b = [0.6, 0.5, 0.5, 0.6, 0.6, 0.5]
    s = paired_stats(a, b, n=2000)
    assert s["ci_low"] < 0 < s["ci_high"]
    assert s["p_value"] > 0.5


def test_results_are_reproducible_with_fixed_seed():
    a, b = [0.1, 0.5, 0.9, 0.3], [0.2, 0.4, 1.0, 0.6]
    assert paired_stats(a, b, n=500) == paired_stats(a, b, n=500)


def test_reports_over_different_queries_are_rejected():
    ra = {"per_query": [{"qid": "q1", "qtype": "keyword", "difficulty": "easy", "ndcg@10": 1.0}]}
    rb = {"per_query": [{"qid": "q2", "qtype": "keyword", "difficulty": "easy", "ndcg@10": 1.0}]}
    with pytest.raises(ValueError):
        compare_reports(ra, rb, "ndcg@10")
