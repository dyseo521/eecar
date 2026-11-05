"""데이터셋 v4 생성: 블라인드 홀드아웃 질의 160개.

    uv run python -m eecar_eval.build_v4

v3와 같은 절차로, 별도 에이전트가 기존 질의(v1~v3)·검색 코드·조건 추출 규칙을 보지 않고 썼다.
차종 조건·카테고리 다중 추출의 비열등성 확인용이며(DECISION_LOG E-27), 구성 선택에는 쓰지 않는다.
"""

from __future__ import annotations

from pathlib import Path

from .build_v3 import build_holdout

V4_DIR = Path(__file__).resolve().parent.parent / "datasets" / "v4"


def main() -> None:
    build_holdout(V4_DIR, "v4")


if __name__ == "__main__":
    main()
