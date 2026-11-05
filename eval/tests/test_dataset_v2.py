"""데이터셋 v2: 재현성, v1과 같은 문서, 검증 규칙, 커밋된 파일 일치."""

import hashlib
import json

from eecar_eval.build import DATASET_DIR as V1_DIR
from eecar_eval.build_v2 import V2_DIR, all_queries, augmented_corpus, build_qrels, validate
from eecar_eval.queries_v2 import DEMAND_QUERIES


def test_v2_documents_are_identical_to_v1():
    # 같은 문서를 써야 v1과 직접 비교하고 문서 임베딩을 재사용할 수 있다
    v1 = [json.loads(line)["part"] for line in (V1_DIR / "corpus.jsonl").read_text(encoding="utf-8").splitlines()]
    assert [r["part"] for r in augmented_corpus()] == v1


def test_v2_passes_validation():
    corpus, queries = augmented_corpus(), all_queries()
    assert validate(corpus, queries, build_qrels(corpus, queries)) == []


def test_committed_v2_files_match_generator():
    manifest = json.loads((V2_DIR / "manifest.json").read_text(encoding="utf-8"))
    for name, digest in manifest["sha256"].items():
        assert hashlib.sha256((V2_DIR / name).read_bytes()).hexdigest() == digest, f"{name} is stale"


def test_demand_queries_follow_research_mix():
    # 세그먼트 건수는 DEMAND_RESEARCH.md (a)의 배분, 형태는 (c)의 권장 비율(35/40/25)에서 크게 벗어나지 않아야 한다
    seg = {}
    for q in DEMAND_QUERIES:
        seg[q.segment] = seg.get(q.segment, 0) + 1
    assert seg == {"A-ess": 57, "B-small-reuse": 23, "C-recycling": 34, "D-collision": 57,
                   "E-electronics": 52, "F-conversion-rnd": 18, "G-browse": 19}
    share = lambda form: sum(q.form == form for q in DEMAND_QUERIES) / len(DEMAND_QUERIES)
    assert 0.30 <= share("sentence") <= 0.40
    assert 0.20 <= share("keyword") <= 0.35


def test_unanswerable_constraints_are_tagged_not_judged():
    tagged = [q for q in DEMAND_QUERIES if q.unanswerable]
    assert 0.05 <= len(tagged) / len(DEMAND_QUERIES) <= 0.15
