from decimal import Decimal

import pytest

from app.losses import calculate_loss
from app.scoring import category_score, overall_score, question_weight, risk_level


def test_question_weight_uses_round_up():
    assert question_weight(3, 2) == 2
    assert question_weight(5, 5) == 5
    with pytest.raises(ValueError):
        question_weight(0, 4)


def test_category_score_and_weighted_example():
    assert category_score(
        [(1, "yes"), (1, "yes"), (1, "yes"), (1, "partial"), (1, "no")]
    ) == Decimal("70.00")
    assert category_score([(2, "unknown"), (1, "yes")]) == Decimal("33.33")


@pytest.mark.parametrize(
    ("score", "expected"),
    [(0, "high"), (39, "high"), (40, "medium"), (69, "medium"), (70, "low"), (100, "low")],
)
def test_risk_boundaries(score, expected):
    assert risk_level(score) == expected


def test_overall_score_uses_half_up_rounding():
    assert overall_score([Decimal("69.5"), Decimal("70.5")]) == 70
    assert overall_score([Decimal("70.5")]) == 71


def test_loss_sle_ale_example_and_zero_frequency():
    values = [
        calculate_loss(100000, Decimal("0.1"), Decimal("0.5"))["ale"],
        calculate_loss(100000, Decimal("0.2"), Decimal("0.5"))["ale"],
        calculate_loss(100000, Decimal("0.5"), Decimal("0.5"))["ale"],
    ]
    assert values == [Decimal("5000.00"), Decimal("10000.00"), Decimal("25000.00")]
    assert calculate_loss(100000, Decimal("0.5"), 0)["ale"] == Decimal("0.00")


@pytest.mark.parametrize(
    ("av", "ef", "aro"),
    [(-1, 0.2, 0.5), (100, -0.1, 0.5), (100, 1.1, 0.5), (100, 0.2, -0.1)],
)
def test_loss_rejects_invalid_inputs(av, ef, aro):
    with pytest.raises(ValueError):
        calculate_loss(av, ef, aro)
