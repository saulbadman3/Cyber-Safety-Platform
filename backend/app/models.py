from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def now_utc() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class Questionnaire(Base):
    __tablename__ = "questionnaires"
    id: Mapped[int] = mapped_column(primary_key=True)
    version: Mapped[str] = mapped_column(String(32), unique=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class Category(Base):
    __tablename__ = "categories"
    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    title: Mapped[str] = mapped_column(String(120))
    position: Mapped[int] = mapped_column(Integer)
    __table_args__ = (UniqueConstraint("position", name="uq_category_position"),)


class Recommendation(Base):
    __tablename__ = "recommendations"
    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    title: Mapped[str] = mapped_column(String(180))
    description: Mapped[str] = mapped_column(Text)
    cost_min: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    cost_max: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    complexity: Mapped[str] = mapped_column(String(20), default="Середня")
    risk_reduction: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0"))
    lesson_slug: Mapped[str] = mapped_column(String(80))
    __table_args__ = (
        CheckConstraint("cost_min >= 0 AND cost_max >= cost_min", name="ck_recommendation_cost"),
        CheckConstraint("risk_reduction >= 0 AND risk_reduction <= 100", name="ck_reduction_range"),
    )


class Question(Base):
    __tablename__ = "questions"
    id: Mapped[int] = mapped_column(primary_key=True)
    questionnaire_id: Mapped[int] = mapped_column(
        ForeignKey("questionnaires.id", ondelete="CASCADE")
    )
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="RESTRICT"))
    recommendation_id: Mapped[int] = mapped_column(
        ForeignKey("recommendations.id", ondelete="RESTRICT")
    )
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    text: Mapped[str] = mapped_column(Text)
    hint: Mapped[str] = mapped_column(Text)
    probability: Mapped[int] = mapped_column(Integer)
    impact: Mapped[int] = mapped_column(Integer)
    weight: Mapped[int] = mapped_column(Integer)
    position: Mapped[int] = mapped_column(Integer)
    __table_args__ = (
        CheckConstraint("probability BETWEEN 1 AND 5", name="ck_question_probability"),
        CheckConstraint("impact BETWEEN 1 AND 5", name="ck_question_impact"),
        CheckConstraint("weight BETWEEN 1 AND 5", name="ck_question_weight"),
        UniqueConstraint("questionnaire_id", "position", name="uq_question_position"),
        Index("ix_question_category_position", "category_id", "position"),
    )


class Assessment(Base):
    __tablename__ = "assessments"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    questionnaire_id: Mapped[int] = mapped_column(
        ForeignKey("questionnaires.id", ondelete="RESTRICT")
    )
    company_name: Mapped[str] = mapped_column(String(160))
    sector: Mapped[str] = mapped_column(String(100))
    employee_range: Mapped[str] = mapped_column(String(30))
    stores_customer_data: Mapped[bool] = mapped_column(Boolean)
    uses_cloud: Mapped[bool] = mapped_column(Boolean)
    status: Mapped[str] = mapped_column(String(16), default="draft", index=True)
    current_question: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        CheckConstraint("status IN ('draft', 'completed')", name="ck_assessment_status"),
        CheckConstraint("current_question BETWEEN 0 AND 14", name="ck_assessment_progress"),
    )


class Answer(Base):
    __tablename__ = "answers"
    id: Mapped[int] = mapped_column(primary_key=True)
    assessment_id: Mapped[int] = mapped_column(ForeignKey("assessments.id", ondelete="CASCADE"))
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="RESTRICT"))
    value: Mapped[str] = mapped_column(String(16))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, onupdate=now_utc
    )
    __table_args__ = (
        UniqueConstraint("assessment_id", "question_id", name="uq_answer_assessment_question"),
        CheckConstraint("value IN ('yes', 'partial', 'no', 'unknown')", name="ck_answer_value"),
    )


class Result(Base):
    __tablename__ = "results"
    id: Mapped[int] = mapped_column(primary_key=True)
    assessment_id: Mapped[int] = mapped_column(
        ForeignKey("assessments.id", ondelete="CASCADE"), unique=True
    )
    total_score: Mapped[int] = mapped_column(Integer)
    risk_level: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    __table_args__ = (
        CheckConstraint("total_score BETWEEN 0 AND 100", name="ck_result_score"),
        CheckConstraint("risk_level IN ('high', 'medium', 'low')", name="ck_result_risk"),
    )


class CategoryResult(Base):
    __tablename__ = "category_results"
    id: Mapped[int] = mapped_column(primary_key=True)
    result_id: Mapped[int] = mapped_column(ForeignKey("results.id", ondelete="CASCADE"))
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="RESTRICT"))
    score: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    __table_args__ = (
        UniqueConstraint("result_id", "category_id", name="uq_category_result"),
        CheckConstraint("score >= 0 AND score <= 100", name="ck_category_score"),
    )


class LossScenario(Base):
    __tablename__ = "loss_scenarios"
    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text)
    assumptions: Mapped[str] = mapped_column(Text)
    sources: Mapped[list] = mapped_column(JSON)
    defaults: Mapped[dict] = mapped_column(JSON)


class LossEstimate(Base):
    __tablename__ = "loss_estimates"
    id: Mapped[int] = mapped_column(primary_key=True)
    assessment_id: Mapped[int] = mapped_column(ForeignKey("assessments.id", ondelete="CASCADE"))
    scenario_id: Mapped[int] = mapped_column(ForeignKey("loss_scenarios.id", ondelete="RESTRICT"))
    variant: Mapped[str] = mapped_column(String(16))
    av: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    ef: Mapped[Decimal] = mapped_column(Numeric(5, 4))
    aro: Mapped[Decimal] = mapped_column(Numeric(8, 4))
    sle: Mapped[Decimal] = mapped_column(Numeric(16, 2))
    ale: Mapped[Decimal] = mapped_column(Numeric(16, 2))
    __table_args__ = (
        UniqueConstraint("assessment_id", "scenario_id", "variant", name="uq_loss_estimate"),
        CheckConstraint("variant IN ('optimistic', 'base', 'pessimistic')", name="ck_loss_variant"),
        CheckConstraint("av >= 0 AND ef >= 0 AND ef <= 1 AND aro >= 0", name="ck_loss_inputs"),
        CheckConstraint("sle >= 0 AND ale >= 0", name="ck_loss_results"),
        Index("ix_loss_assessment", "assessment_id"),
    )


class ActionItem(Base):
    __tablename__ = "action_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    assessment_id: Mapped[int] = mapped_column(ForeignKey("assessments.id", ondelete="CASCADE"))
    recommendation_id: Mapped[int] = mapped_column(
        ForeignKey("recommendations.id", ondelete="RESTRICT")
    )
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="RESTRICT"))
    priority: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    status: Mapped[str] = mapped_column(String(20), default="todo")
    assignee: Mapped[str] = mapped_column(String(120), default="")
    due_date: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    __table_args__ = (
        UniqueConstraint("assessment_id", "question_id", name="uq_action_assessment_question"),
        CheckConstraint("priority > 0 AND priority <= 5", name="ck_action_priority"),
        CheckConstraint("status IN ('todo', 'in_progress', 'done')", name="ck_action_status"),
        Index("ix_action_assessment_status", "assessment_id", "status"),
    )


class Microlesson(Base):
    __tablename__ = "microlessons"
    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="RESTRICT"))
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(Text)
    takeaways: Mapped[list] = mapped_column(JSON)
    recommendation_slugs: Mapped[list] = mapped_column(JSON)


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"
    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="RESTRICT"))
    sender: Mapped[str] = mapped_column(String(160))
    subject: Mapped[str] = mapped_column(String(220))
    body: Mapped[str] = mapped_column(Text)
    is_phishing: Mapped[bool] = mapped_column(Boolean)
    explanation: Mapped[str] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer, unique=True)


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    score: Mapped[int] = mapped_column(Integer)
    total: Mapped[int] = mapped_column(Integer)
    answers: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    __table_args__ = (
        CheckConstraint("score >= 0 AND total = 12 AND score <= total", name="ck_quiz_score"),
    )
