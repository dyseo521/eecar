"""데이터셋이 재현 가능하고, 커밋된 파일이 생성기 결과와 같은지 확인한다."""

import hashlib
import json

from eecar_eval.build import DATASET_DIR, MAX_RELEVANT_PER_QUERY, build_qrels, validate
from eecar_eval.corpus import TARGET_COUNTS, build_corpus
from eecar_eval.queries import QUERIES


def _sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_corpus_generation_is_deterministic():
    assert build_corpus() == build_corpus()


def test_corpus_matches_target_counts():
    corpus = build_corpus()
    for category, count in TARGET_COUNTS.items():
        assert sum(1 for r in corpus if r["part"]["category"] == category) == count


def test_dataset_passes_validation():
    corpus = build_corpus()
    assert validate(corpus, build_qrels(corpus)) == []


def test_committed_files_match_generator_output():
    # 생성기를 바꾸고 build를 다시 돌리지 않으면 실패한다
    manifest = json.loads((DATASET_DIR / "manifest.json").read_text(encoding="utf-8"))
    for name, digest in manifest["sha256"].items():
        assert _sha256(DATASET_DIR / name) == digest, f"{name} is stale: run `python -m eecar_eval.build`"

    corpus = build_corpus()
    committed = [json.loads(line) for line in (DATASET_DIR / "corpus.jsonl").read_text(encoding="utf-8").splitlines()]
    assert committed == json.loads(json.dumps(corpus, ensure_ascii=False))


def test_search_documents_do_not_carry_judgement_attributes():
    for record in build_corpus():
        assert "attrs" not in record["part"]
        assert set(record) == {"part", "attrs"}


def test_query_ids_are_unique_and_cover_all_types():
    ids = [q.id for q in QUERIES]
    assert len(ids) == len(set(ids))
    assert {q.qtype for q in QUERIES} == {"keyword", "semantic", "mixed"}
    assert {q.difficulty for q in QUERIES} == {"easy", "medium", "hard"}


def test_relevant_document_cap_is_respected():
    qrels = build_qrels(build_corpus())
    for q in QUERIES:
        assert sum(1 for r in qrels if r["qid"] == q.id and r["grade"] >= 2) <= MAX_RELEVANT_PER_QUERY
