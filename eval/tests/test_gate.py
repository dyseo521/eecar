from eecar_eval.gate import compare

BASELINE = {"overall": {"ndcg@10": 0.75, "recall@10": 0.80}}


def test_drop_within_tolerance_passes():
    assert compare(BASELINE, {"overall": {"ndcg@10": 0.745, "recall@10": 0.80}}, 0.01) == []


def test_drop_beyond_tolerance_is_reported():
    regressions = compare(BASELINE, {"overall": {"ndcg@10": 0.70, "recall@10": 0.80}}, 0.01)
    assert regressions == ["overall ndcg@10: 0.7500 -> 0.7000"]


def test_missing_group_is_a_regression():
    assert compare(BASELINE, {}, 0.01) == ["overall ndcg@10: 0.7500 -> None", "overall recall@10: 0.8000 -> None"]
