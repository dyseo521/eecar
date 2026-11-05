"""데이터셋 v4 (두 번째 블라인드 홀드아웃): 검증 규칙, v2와 같은 문서, 커밋된 파일 일치, 수요 비율."""

import hashlib
import json

from eecar_eval.build_v2 import V2_DIR, build_qrels, validate
from eecar_eval.build_v3 import load_queries
from eecar_eval.build_v4 import V4_DIR
from eecar_eval.relevance import MATCHERS


def test_v4_uses_the_v2_documents_and_passes_validation():
    assert (V4_DIR / "corpus.jsonl").read_bytes() == (V2_DIR / "corpus.jsonl").read_bytes()
    corpus = [json.loads(line) for line in (V2_DIR / "corpus.jsonl").read_text(encoding="utf-8").splitlines()]
    queries = load_queries(V4_DIR)
    assert validate(corpus, queries, build_qrels(corpus, queries)) == []
    for q in queries:
        assert set(q["must"]) | set(q["should"]) <= set(MATCHERS), q["id"]


def test_committed_v4_files_match_builder():
    manifest = json.loads((V4_DIR / "manifest.json").read_text(encoding="utf-8"))
    for name, digest in manifest["sha256"].items():
        assert hashlib.sha256((V4_DIR / name).read_bytes()).hexdigest() == digest, f"{name} is stale"


def test_v4_follows_the_research_mix_and_differs_from_v3():
    queries = load_queries(V4_DIR)
    seg = {}
    for q in queries:
        seg[q["segment"]] = seg.get(q["segment"], 0) + 1
    assert seg == {"A-ess": 35, "B-small-reuse": 14, "C-recycling": 21, "D-collision": 35,
                   "E-electronics": 32, "F-conversion-rnd": 11, "G-browse": 12}
    # 두 홀드아웃은 따로 썼으므로, 겹치는 문구는 "BMW i3"·"인버터"처럼 흔한 짧은 키워드뿐이어야 한다
    v3_texts = {q["text"] for q in load_queries()}
    overlap = [q for q in queries if q["text"] in v3_texts]
    assert len(overlap) <= 5
    assert all(q["form"] == "keyword" and len(q["text"].split()) <= 2 for q in overlap)
