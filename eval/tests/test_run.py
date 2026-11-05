from eecar_eval.run import evaluate, to_markdown

QUERIES = [
    {"id": "q1", "text": "a", "qtype": "keyword", "difficulty": "easy"},
    {"id": "q2", "text": "b", "qtype": "semantic", "difficulty": "hard"},
]
QRELS = [
    {"qid": "q1", "partId": "d1", "grade": 3},
    {"qid": "q2", "partId": "d2", "grade": 3},
]


def test_evaluate_aggregates_overall_and_by_group():
    run = [
        {"qid": "q1", "results": [{"partId": "d1", "score": 1.0}]},
        {"qid": "q2", "results": []},
    ]
    result = evaluate(run, QUERIES, QRELS)

    assert result["groups"]["overall"]["ndcg@10"] == 0.5
    assert result["groups"]["overall"]["zero_result"] == 0.5
    assert result["groups"]["qtype=keyword"]["ndcg@10"] == 1.0
    assert result["groups"]["difficulty=hard"]["recall@10"] == 0.0


def test_queries_missing_from_run_are_scored_as_empty():
    result = evaluate([], QUERIES, QRELS)
    assert result["groups"]["overall"]["zero_result"] == 1.0


def test_markdown_lists_failed_queries():
    report = {
        "meta": {"system": "s", "dataset": "v1", "date": "2026-11-05", "commit": "abc", "corpus_sha256": "f" * 64,
                 "documents": 2, "queries": 2},
        **evaluate([{"qid": "q1", "results": [{"partId": "d1", "score": 1.0}]}], QUERIES, QRELS),
    }
    md = to_markdown(report)
    assert "| overall | 2 |" in md
    assert "`q2`" in md and "(결과 없음)" in md
