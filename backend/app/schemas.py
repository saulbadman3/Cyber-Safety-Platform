import re
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

AnswerValue = Literal["yes", "partial", "no", "unknown"]
LossVariant = Literal["optimistic", "base", "pessimistic"]
ActionStatus = Literal["todo", "in_progress", "done"]


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RegisterInput(ApiModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=10, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", normalized):
            raise ValueError("Введіть коректну електронну адресу.")
        return normalized


class LoginInput(RegisterInput):
    password: str = Field(min_length=1, max_length=128)


class UserOut(ApiModel):
    id: int
    email: str
    created_at: datetime


class BusinessProfile(ApiModel):
    company_name: str = Field(min_length=1, max_length=160)
    sector: str = Field(min_length=1, max_length=100)
    employee_range: Literal["1-5", "6-20", "21-50", "51-100", "101+"]
    stores_customer_data: bool
    uses_cloud: bool

    @field_validator("company_name", "sector")
    @classmethod
    def trim_required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Поле не може бути порожнім.")
        return value


class AnswerInput(ApiModel):
    question_id: int = Field(gt=0)
    value: AnswerValue


class AnswersUpdate(ApiModel):
    answers: list[AnswerInput] = Field(min_length=1, max_length=14)
    current_question: int = Field(ge=0, le=14)


class LossCalculationInput(ApiModel):
    av: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    ef: Decimal = Field(ge=0, le=1, max_digits=5, decimal_places=4)
    aro: Decimal = Field(ge=0, max_digits=8, decimal_places=4)


class LossEstimateInput(LossCalculationInput):
    scenario_id: int = Field(gt=0)
    variant: LossVariant


class LossEstimatesUpdate(ApiModel):
    estimates: list[LossEstimateInput] = Field(min_length=1, max_length=15)


class ActionItemPatch(ApiModel):
    status: ActionStatus | None = None
    assignee: str | None = Field(default=None, max_length=120)
    due_date: date | None = None


class QuizAnswerInput(ApiModel):
    question_id: int = Field(gt=0)
    is_phishing: bool


class QuizSubmit(ApiModel):
    answers: list[QuizAnswerInput] = Field(min_length=1, max_length=12)


class ErrorBody(ApiModel):
    code: str
    message: str


class ErrorResponse(ApiModel):
    error: ErrorBody
