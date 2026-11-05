"""질의 의도(intent)와 부품 속성(attrs)으로 정답 등급을 계산한다.

등급 (graded relevance)
- 3: must 조건과 should 조건을 모두 만족
- 2: must 조건은 모두 만족하지만 should 조건 일부를 만족하지 못함
- 1: 카테고리는 맞고, 카테고리 외 must 조건이 2개 이상인데 그중 일부만 만족
- 0: 그 외

LLM 판정 대신 규칙으로 등급을 매기는 이유: 코퍼스를 LLM과 함께 만들었기 때문에
판정까지 LLM에 맡기면 LLM 기반 검색에 유리하게 치우칠 수 있다.
한계: 의미상 관련 있지만 속성으로 표현되지 않은 문서는 0점이 된다.
"""

from __future__ import annotations

from typing import Any, Callable

Matcher = Callable[[dict[str, Any], Any], bool]


def _in(key: str) -> Matcher:
    def match(attrs: dict[str, Any], expected: Any) -> bool:
        values = expected if isinstance(expected, (list, tuple)) else [expected]
        return attrs.get(key) in values

    return match


def _min(key: str) -> Matcher:
    return lambda attrs, threshold: attrs.get(key) is not None and attrs[key] >= threshold


def _max(key: str) -> Matcher:
    return lambda attrs, threshold: attrs.get(key) is not None and attrs[key] <= threshold


def _any_of(key: str) -> Matcher:
    return lambda attrs, expected: bool(set(attrs.get(key) or []) & set(expected))


MATCHERS: dict[str, Matcher] = {
    "category": _in("category"),
    "subtype": _in("subtype"),
    "vehicle": _in("vehicle"),
    "maker": _in("maker"),
    "part_maker": _in("part_maker"),
    "cell_maker": _in("cell_maker"),
    "cathode": _in("cathode"),
    "pack_kwh": _in("pack_kwh"),
    "soh_min": _min("soh"),
    "soh_max": _max("soh"),
    "power_min": _min("power_kw"),
    "power_max": _max("power_kw"),
    "torque_min": _min("torque_nm"),
    "voltage_class": _in("voltage_class"),
    "semiconductor": _in("semiconductor"),
    "motor_type": _in("motor_type"),
    "rare_earth": lambda attrs, expected: attrs.get("rare_earth") is expected,
    "material": _in("material"),
    "alloy": _in("alloy"),
    "tensile_min": _min("tensile"),
    "application": _any_of("applications"),
    "recommended_use": _in("recommended_use"),
    "connector": _in("connector"),
    # v2: 실제 구매자 질의에 자주 나오는 거래 조건 (v2 빌더가 part의 가격·수량·상태를 attrs로 옮긴다)
    "price_max": _max("price"),
    "price_min": _min("price"),
    "year_min": _min("year"),
    "year_max": _max("year"),
    "quantity_min": _min("quantity"),
    "condition": _in("condition"),
    "kwh_min": _min("kwh"),
    "kwh_max": _max("kwh"),
}


def satisfies(attrs: dict[str, Any], key: str, expected: Any) -> bool:
    if key not in MATCHERS:
        raise KeyError(f"unknown intent key: {key}")
    return MATCHERS[key](attrs, expected)


def grade(attrs: dict[str, Any], must: dict[str, Any], should: dict[str, Any] | None = None) -> int:
    should = should or {}
    must_ok = [satisfies(attrs, k, v) for k, v in must.items()]

    if all(must_ok):
        if all(satisfies(attrs, k, v) for k, v in should.items()):
            return 3
        return 2

    category_ok = "category" not in must or satisfies(attrs, "category", must["category"])
    non_category = [ok for (k, _), ok in zip(must.items(), must_ok) if k != "category"]
    if category_ok and len(non_category) >= 2 and any(non_category):
        return 1
    return 0
