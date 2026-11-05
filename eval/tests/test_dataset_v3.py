"""데이터셋 v3 (블라인드 홀드아웃): 검증 규칙, v2와 같은 문서, 커밋된 파일 일치, 수요 비율."""

import hashlib
import json

from eecar_eval.build_v2 import V2_DIR, build_qrels, validate
from eecar_eval.build_v3 import V3_DIR, load_queries
from eecar_eval.relevance import MATCHERS


def _corpus():
    return [json.loads(line) for line in (V2_DIR / "corpus.jsonl").read_text(encoding="utf-8").splitlines()]


def test_v3_uses_the_v2_documents():
    v3 = (V3_DIR / "corpus.jsonl").read_bytes()
    assert hashlib.sha256(v3).hexdigest() == hashlib.sha256((V2_DIR / "corpus.jsonl").read_bytes()).hexdigest()


def test_v3_passes_validation_and_uses_known_keys():
    corpus, queries = _corpus(), load_queries()
    assert validate(corpus, queries, build_qrels(corpus, queries)) == []
    for q in queries:
        assert set(q["must"]) | set(q["should"]) <= set(MATCHERS), q["id"]


def test_committed_v3_files_match_builder():
    manifest = json.loads((V3_DIR / "manifest.json").read_text(encoding="utf-8"))
    for name, digest in manifest["sha256"].items():
        assert hashlib.sha256((V3_DIR / name).read_bytes()).hexdigest() == digest, f"{name} is stale"


def test_v3_follows_the_research_mix():
    # 세그먼트 배분은 v2와 같은 DEMAND_RESEARCH.md 비율 (160개 기준)
    queries = load_queries()
    seg = {}
    for q in queries:
        seg[q["segment"]] = seg.get(q["segment"], 0) + 1
    assert seg == {"A-ess": 35, "B-small-reuse": 14, "C-recycling": 21, "D-collision": 35,
                   "E-electronics": 32, "F-conversion-rnd": 11, "G-browse": 12}
    share = lambda form: sum(q["form"] == form for q in queries) / len(queries)
    assert 0.30 <= share("sentence") <= 0.40
    assert 0.05 <= sum(bool(q["unanswerable"]) for q in queries) / len(queries) <= 0.15
