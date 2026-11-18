"""Idempotently load the versioned questionnaire and learning seed data."""

import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import make_engine, make_session_factory
from app.models import (
    Base,
    Category,
    LossScenario,
    Microlesson,
    Question,
    Questionnaire,
    QuizQuestion,
    Recommendation,
)
from app.scoring import question_weight

SEED_DIR = Path(__file__).parent / "seed"


def load_json(filename: str) -> dict:
    return json.loads((SEED_DIR / filename).read_text(encoding="utf-8"))


def seed_all(session: Session) -> None:
    questions_data = load_json("questions.json")
    learning_data = load_json("learning.json")
    loss_data = load_json("loss_scenarios.json")

    questionnaire = session.scalar(
        select(Questionnaire).where(
            Questionnaire.version == questions_data["questionnaire_version"]
        )
    )
    if questionnaire is None:
        questionnaire = Questionnaire(version=questions_data["questionnaire_version"], active=True)
        session.add(questionnaire)
        session.flush()
    session.query(Questionnaire).filter(Questionnaire.id != questionnaire.id).update(
        {Questionnaire.active: False}
    )
    questionnaire.active = True

    categories: dict[str, Category] = {}
    for row in questions_data["categories"]:
        category = session.scalar(select(Category).where(Category.slug == row["slug"]))
        if category is None:
            category = Category(slug=row["slug"], title=row["title"], position=row["position"])
            session.add(category)
        else:
            category.title = row["title"]
            category.position = row["position"]
        categories[row["slug"]] = category
    session.flush()

    recommendations: dict[str, Recommendation] = {}
    for row in questions_data["recommendations"]:
        recommendation = session.scalar(
            select(Recommendation).where(Recommendation.slug == row["slug"])
        )
        values = {
            "title": row["title"],
            "description": row["description"],
            "cost_min": row["cost_min"],
            "cost_max": row["cost_max"],
            "complexity": row["complexity"],
            "risk_reduction": row["risk_reduction"],
            "lesson_slug": row["lesson_slug"],
        }
        if recommendation is None:
            recommendation = Recommendation(slug=row["slug"], **values)
            session.add(recommendation)
        else:
            for key, value in values.items():
                setattr(recommendation, key, value)
        recommendations[row["slug"]] = recommendation
    session.flush()

    for row in questions_data["questions"]:
        expected_weight = question_weight(row["probability"], row["impact"])
        if row["weight"] != expected_weight:
            raise ValueError(f"Seed weight mismatch for {row['slug']}.")
        question = session.scalar(select(Question).where(Question.slug == row["slug"]))
        values = {
            "questionnaire_id": questionnaire.id,
            "category_id": categories[row["category"]].id,
            "recommendation_id": recommendations[row["recommendation"]].id,
            "text": row["text"],
            "hint": row["hint"],
            "probability": row["probability"],
            "impact": row["impact"],
            "weight": expected_weight,
            "position": row["position"],
        }
        if question is None:
            session.add(Question(slug=row["slug"], **values))
        else:
            for key, value in values.items():
                setattr(question, key, value)

    for row in loss_data["scenarios"]:
        scenario = session.scalar(select(LossScenario).where(LossScenario.slug == row["slug"]))
        values = {
            "title": row["title"],
            "description": row["description"],
            "assumptions": row["assumptions"],
            "sources": row["sources"],
            "defaults": row["defaults"],
        }
        if scenario is None:
            session.add(LossScenario(slug=row["slug"], **values))
        else:
            for key, value in values.items():
                setattr(scenario, key, value)

    for row in learning_data["lessons"]:
        lesson = session.scalar(select(Microlesson).where(Microlesson.slug == row["slug"]))
        values = {
            "category_id": categories[row["category"]].id,
            "title": row["title"],
            "body": row["body"],
            "takeaways": row["takeaways"],
            "recommendation_slugs": row["recommendations"],
        }
        if lesson is None:
            session.add(Microlesson(slug=row["slug"], **values))
        else:
            for key, value in values.items():
                setattr(lesson, key, value)

    for row in learning_data["quiz"]:
        quiz_question = session.scalar(select(QuizQuestion).where(QuizQuestion.slug == row["slug"]))
        values = {
            "category_id": categories[row["category"]].id,
            "sender": row["sender"],
            "subject": row["subject"],
            "body": row["body"],
            "is_phishing": row["is_phishing"],
            "explanation": row["explanation"],
            "position": row["position"],
        }
        if quiz_question is None:
            session.add(QuizQuestion(slug=row["slug"], **values))
        else:
            for key, value in values.items():
                setattr(quiz_question, key, value)
    session.commit()


def main() -> None:
    engine = make_engine(get_settings().database_url)
    Base.metadata.create_all(engine)
    factory = make_session_factory(engine)
    with factory() as session:
        seed_all(session)
    engine.dispose()
    print("Cyber Check templates seeded.")


if __name__ == "__main__":
    main()
