from eecar_eval.llm_candidates import _call_stats, _pct


def test_percentile_uses_nearest_rank_on_sorted_values():
    values = [5.0, 1.0, 3.0, 2.0, 4.0]
    assert _pct(values, 0.5) == 3.0
    assert _pct(values, 0.95) == 5.0
    assert _pct([7.0], 0.95) == 7.0


def test_call_stats_separates_failed_calls_from_latency_and_tokens():
    rows = [
        {"latencyMs": 1000.0, "inputTokens": 100, "outputTokens": 40, "parsed": True},
        {"latencyMs": 3000.0, "inputTokens": 120, "outputTokens": 60, "parsed": False},
        {"latencyMs": None, "inputTokens": 0, "outputTokens": 0, "parsed": False},  # 호출 자체가 실패
    ]
    s = _call_stats(rows, "parsed")
    assert s["n"] == 3
    assert s["ok"] == 1
    assert s["failed_calls"] == 1
    assert s["latency_p50"] == 2000.0
    assert s["in_tokens_mean"] == 110
    assert s["out_tokens_mean"] == 50
