import pytest

from eecar_eval.relevance import grade, satisfies

BATTERY = {
    "category": "battery",
    "subtype": "battery-pack",
    "vehicle": "ioniq5",
    "cathode": "NCM Ni 80%",
    "soh": 84,
    "applications": ["ESS", "UPS"],
}


def test_all_must_and_should_constraints_give_grade_three():
    assert grade(BATTERY, {"category": "battery", "vehicle": "ioniq5"}, {"subtype": "battery-pack"}) == 3


def test_missing_should_constraint_gives_grade_two():
    assert grade(BATTERY, {"category": "battery", "vehicle": "ioniq5"}, {"subtype": "battery-module"}) == 2


def test_partial_must_match_within_category_gives_grade_one():
    must = {"category": "battery", "vehicle": "ioniq5", "cathode": "LFP"}
    assert grade(BATTERY, must) == 1


def test_single_non_category_constraint_miss_is_not_partially_relevant():
    # 카테고리 외 조건이 하나뿐이면 '일부 만족'이 성립하지 않는다
    assert grade(BATTERY, {"category": "battery", "vehicle": "model3"}) == 0


def test_other_category_is_irrelevant():
    assert grade({**BATTERY, "category": "motor"}, {"category": "battery", "vehicle": "ioniq5", "soh_min": 80}) == 0


@pytest.mark.parametrize(
    ("key", "expected", "result"),
    [
        ("soh_min", 84, True),
        ("soh_min", 85, False),
        ("application", ["ESS"], True),
        ("application", ["전동킥보드"], False),
        ("vehicle", ["ioniq5", "ev6"], True),
    ],
)
def test_matchers(key, expected, result):
    assert satisfies(BATTERY, key, expected) is result


def test_numeric_matchers_treat_missing_attributes_as_unsatisfied():
    assert satisfies(BATTERY, "power_min", 100) is False


def test_unknown_intent_key_is_rejected():
    with pytest.raises(KeyError):
        satisfies(BATTERY, "colour", "red")
