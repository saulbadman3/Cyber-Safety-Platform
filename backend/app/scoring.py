from collections.abc import Iterable
from decimal import ROUND_HALF_UP, Decimal
from math import ceil

ANSWER_POINTS = {
    "yes": Decimal("1"),
    "partial": Decimal("0.5"),
    "no": Decimal("0"),
    "unknown": Decimal("0"),
}
RISK_LABELS = {
    "high": "Високий",
    "medium": "Середній",
    "low": "Низький",
}


def question_weight(probability: int, impact: int) -> int:
    if not 1 <= probability <= 5 or not 1 <= impact <= 5:
        raise ValueError("Імовірність і вплив мають бути від 1 до 5.")
    return ceil(Decimal(probability * impact) / Decimal(5))


def risk_level(score: int) -> str:
    if not 0 <= score <= 100:
        raise ValueError("Рейтинг має бути від 0 до 100.")
    if score <= 39:
        return "high"
    if score <= 69:
        return "medium"
    return "low"


def category_score(items: Iterable[tuple[int, str]]) -> Decimal:
    earned = Decimal("0")
    maximum = Decimal("0")
    for weight, answer in items:
        if answer not in ANSWER_POINTS or weight < 1:
            raise ValueError("Некоректні дані для оцінки категорії.")
        earned += ANSWER_POINTS[answer] * Decimal(weight)
        maximum += Decimal(weight)
    if maximum == 0:
        return Decimal("0.00")
    return (earned / maximum * Decimal(100)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def overall_score(scores: Iterable[Decimal | int | float]) -> int:
    values = [Decimal(str(score)) for score in scores]
    if not values or any(score < 0 or score > 100 for score in values):
        raise ValueError("Потрібні оцінки категорій у діапазоні 0–100.")
    return int(
        (sum(values, Decimal("0")) / Decimal(len(values))).quantize(
            Decimal("1"), rounding=ROUND_HALF_UP
        )
    )


def priority_for(weight: int, answer: str) -> Decimal:
    if answer not in ANSWER_POINTS or weight < 1:
        raise ValueError("Некоректні дані для пріоритету.")
    return (Decimal(weight) * (Decimal(1) - ANSWER_POINTS[answer])).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
