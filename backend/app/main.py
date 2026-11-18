import secrets
import threading
import time
from collections import defaultdict
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_session, make_engine, make_session_factory
from app.losses import calculate_loss
from app.models import (
    ActionItem,
    Answer,
    Assessment,
    Category,
    CategoryResult,
    LossEstimate,
    LossScenario,
    Microlesson,
    Question,
    Questionnaire,
    QuizAttempt,
    QuizQuestion,
    Recommendation,
    Result,
    User,
)
from app.schemas import (
    ActionItemPatch,
    AnswersUpdate,
    BusinessProfile,
    LoginInput,
    LossCalculationInput,
    LossEstimatesUpdate,
    QuizSubmit,
    RegisterInput,
)
from app.scoring import (
    RISK_LABELS,
    category_score,
    overall_score,
    priority_for,
    risk_level,
)
from app.security import hash_password, issue_token, read_token, verify_password

API_PREFIX = "/api/v1"
ANSWER_LABELS = {
    "yes": "Так",
    "partial": "Частково",
    "no": "Ні",
    "unknown": "Не знаю",
}
RISK_COLORS = {"high": "#b42318", "medium": "#a15c00", "low": "#18794e"}
ACTION_LABELS = {"todo": "До виконання", "in_progress": "В роботі", "done": "Виконано"}
VARIANT_LABELS = {
    "optimistic": "Оптимістичний",
    "base": "Базовий",
    "pessimistic": "Песимістичний",
}


def utcnow() -> datetime:
    return datetime.now(UTC)


def _error(code: str, message: str) -> dict[str, dict[str, str]]:
    return {"error": {"code": code, "message": message}}


def _not_found() -> HTTPException:
    return HTTPException(status_code=404, detail={"code": "not_found", "message": "Не знайдено."})


def _owned_assessment(session: Session, user_id: int, assessment_id: int) -> Assessment:
    assessment = session.scalar(
        select(Assessment).where(Assessment.id == assessment_id, Assessment.user_id == user_id)
    )
    if assessment is None:
        raise _not_found()
    return assessment


def _question_payload(
    question: Question, category: Category, recommendation: Recommendation
) -> dict[str, Any]:
    return {
        "id": question.id,
        "slug": question.slug,
        "text": question.text,
        "hint": question.hint,
        "position": question.position,
        "weight": question.weight,
        "probability": question.probability,
        "impact": question.impact,
        "category": {"slug": category.slug, "title": category.title},
        "recommendation": {
            "slug": recommendation.slug,
            "title": recommendation.title,
            "description": recommendation.description,
        },
    }


def _recommendation_payload(item: ActionItem, rec: Recommendation, question: Question) -> dict:
    score = Decimal(item.priority)
    priority_label = (
        "Високий"
        if score >= Decimal("3.5")
        else "Середній"
        if score >= Decimal("1.5")
        else "Низький"
    )
    return {
        "id": item.id,
        "question_id": question.id,
        "title": rec.title,
        "description": rec.description,
        "priority": item.priority,
        "priority_label": priority_label,
        "status": item.status,
        "status_label": ACTION_LABELS[item.status],
        "cost_min": rec.cost_min,
        "cost_max": rec.cost_max,
        "complexity": rec.complexity,
        "risk_reduction": rec.risk_reduction,
        "assignee": item.assignee,
        "due_date": item.due_date,
        "lesson_slug": rec.lesson_slug,
    }


def _scenario_defaults(assessment: Assessment, scenario: LossScenario) -> dict[str, dict[str, Any]]:
    employee_factor = {
        "1-5": Decimal("0.8"),
        "6-20": Decimal("1"),
        "21-50": Decimal("1.25"),
        "51-100": Decimal("1.5"),
        "101+": Decimal("2"),
    }.get(assessment.employee_range, Decimal("1"))
    profile_factor = employee_factor
    if assessment.stores_customer_data and scenario.slug == "customer-data-leak":
        profile_factor *= Decimal("1.25")
    if assessment.uses_cloud and scenario.slug in {"account-takeover", "ransomware"}:
        profile_factor *= Decimal("1.1")
    defaults = {}
    for variant, values in scenario.defaults.items():
        adjusted = dict(values)
        adjusted["av"] = str((Decimal(str(values["av"])) * profile_factor).quantize(Decimal("1")))
        adjusted["ef"] = str(values["ef"])
        adjusted["aro"] = str(values["aro"])
        defaults[variant] = adjusted
    return defaults


def _loss_payload(
    assessment: Assessment, scenario: LossScenario, estimates: list[LossEstimate]
) -> dict[str, Any]:
    saved = {
        estimate.variant: estimate for estimate in estimates if estimate.scenario_id == scenario.id
    }
    defaults = _scenario_defaults(assessment, scenario)
    variants = []
    for variant in ("optimistic", "base", "pessimistic"):
        item = saved.get(variant)
        inputs = (
            {"av": item.av, "ef": item.ef, "aro": item.aro, "sle": item.sle, "ale": item.ale}
            if item
            else calculate_loss(
                defaults[variant]["av"], defaults[variant]["ef"], defaults[variant]["aro"]
            )
        )
        variants.append(
            {
                "variant": variant,
                "label": VARIANT_LABELS[variant],
                "av": str(inputs["av"]),
                "ef": str(inputs["ef"]),
                "aro": str(inputs["aro"]),
                "sle": str(inputs["sle"]),
                "ale": str(inputs["ale"]),
            }
        )
    return {
        "id": scenario.id,
        "slug": scenario.slug,
        "title": scenario.title,
        "description": scenario.description,
        "assumptions": scenario.assumptions,
        "sources": scenario.sources,
        "variants": variants,
    }


def _assessment_result(session: Session, assessment: Assessment) -> Result | None:
    return session.scalar(select(Result).where(Result.assessment_id == assessment.id))


def _category_payload(session: Session, result: Result) -> list[dict]:
    rows = session.execute(
        select(CategoryResult, Category)
        .join(Category, Category.id == CategoryResult.category_id)
        .where(CategoryResult.result_id == result.id)
        .order_by(Category.position)
    ).all()
    return [
        {"slug": category.slug, "title": category.title, "score": row.score}
        for row, category in rows
    ]


def _assessment_summary(session: Session, assessment: Assessment) -> dict:
    result = _assessment_result(session, assessment)
    estimates = session.scalars(
        select(LossEstimate).where(LossEstimate.assessment_id == assessment.id)
    ).all()
    scenarios = session.scalars(select(LossScenario)).all()
    loss_rows = [_loss_payload(assessment, scenario, estimates) for scenario in scenarios]
    total_ale = sum(
        (
            Decimal(str(variant["ale"]))
            for scenario in loss_rows
            for variant in scenario["variants"]
            if variant["variant"] == "base"
        ),
        Decimal("0"),
    )
    action_items = session.scalars(
        select(ActionItem).where(ActionItem.assessment_id == assessment.id)
    ).all()
    done = sum(item.status == "done" for item in action_items)
    return {
        "id": assessment.id,
        "company_name": assessment.company_name,
        "sector": assessment.sector,
        "employee_range": assessment.employee_range,
        "status": assessment.status,
        "created_at": assessment.created_at,
        "completed_at": assessment.completed_at,
        "total_score": result.total_score if result else None,
        "risk_level": result.risk_level if result else None,
        "risk_label": RISK_LABELS.get(result.risk_level) if result else None,
        "total_ale": total_ale,
        "action_done": done,
        "action_total": len(action_items),
    }


def create_app(
    settings: Settings | None = None,
    *,
    database_url: str | None = None,
    secret_key: str | None = None,
    cookie_secure: bool | None = None,
) -> FastAPI:
    cfg = settings or get_settings()
    if database_url:
        cfg = cfg.model_copy(update={"database_url": database_url})
    if secret_key:
        cfg = cfg.model_copy(update={"jwt_secret": secret_key})
    if cookie_secure is not None:
        cfg = cfg.model_copy(update={"cookie_secure": cookie_secure})

    app = FastAPI(
        title="Cyber Check API",
        version="1.0.0",
        description="API україномовного самоаудиту кібербезпеки малого бізнесу.",
    )
    engine = make_engine(cfg.database_url)
    app.state.settings = cfg
    app.state.engine = engine
    app.state.session_factory = make_session_factory(engine)
    app.state.login_attempts = defaultdict(list)
    app.state.login_lock = threading.Lock()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cfg.allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "OPTIONS"],
        allow_headers=["Content-Type", "X-CSRF-Token"],
    )

    @app.middleware("http")
    async def security_and_csrf(request: Request, call_next):
        method = request.method.upper()
        path = request.url.path
        mutating = method in {"POST", "PUT", "PATCH", "DELETE"}
        public_mutations = {
            f"{API_PREFIX}/auth/register",
            f"{API_PREFIX}/auth/login",
            f"{API_PREFIX}/loss/calculate",
        }
        has_session = bool(request.cookies.get("access_token"))
        if (
            mutating
            and path.startswith(API_PREFIX)
            and path not in public_mutations
            and has_session
        ):
            cookie_token = request.cookies.get("csrf_token")
            header_token = request.headers.get("x-csrf-token")
            if (
                not cookie_token
                or not header_token
                or not secrets.compare_digest(cookie_token, header_token)
            ):
                return JSONResponse(
                    status_code=403,
                    content=_error("csrf_failed", "Оновіть сторінку та повторіть дію."),
                )
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; "
            "form-action 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
            "script-src 'self'; connect-src 'self'"
        )
        if path.startswith(API_PREFIX):
            response.headers["Cache-Control"] = "no-store"
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

    @app.exception_handler(HTTPException)
    async def http_error_handler(_request: Request, exc: HTTPException):
        if isinstance(exc.detail, dict):
            detail = exc.detail
            code = detail.get("code", "request_failed")
            message = detail.get("message", "Запит не вдалося виконати.")
        else:
            code = "request_failed"
            message = str(exc.detail)
        return JSONResponse(
            status_code=exc.status_code, content=_error(code, message), headers=exc.headers
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_request: Request, _exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content=_error("validation_error", "Перевірте введені дані."),
        )

    @app.exception_handler(IntegrityError)
    async def integrity_error_handler(_request: Request, _exc: IntegrityError):
        return JSONResponse(
            status_code=409,
            content=_error("conflict", "Запис конфліктує з наявними даними."),
        )

    @app.exception_handler(Exception)
    async def internal_error_handler(_request: Request, _exc: Exception):
        return JSONResponse(
            status_code=500,
            content=_error("internal_error", "Сталася внутрішня помилка. Спробуйте пізніше."),
        )

    def current_user(request: Request, session: Session = Depends(get_session)) -> User:
        token = request.cookies.get("access_token")
        user_id = read_token(token, request.app.state.settings.jwt_secret) if token else None
        user = session.get(User, user_id) if user_id else None
        if user is None:
            raise HTTPException(
                status_code=401,
                detail={"code": "unauthorized", "message": "Увійдіть, щоб продовжити."},
            )
        return user

    def set_auth_cookies(response: Response, user: User) -> None:
        active = app.state.settings
        token = issue_token(user.id, active.jwt_secret, active.jwt_expire_minutes)
        csrf = secrets.token_urlsafe(32)
        response.set_cookie(
            "access_token",
            token,
            httponly=True,
            secure=active.cookie_secure,
            samesite="lax",
            max_age=active.jwt_expire_minutes * 60,
            path="/",
        )
        response.set_cookie(
            "csrf_token",
            csrf,
            httponly=False,
            secure=active.cookie_secure,
            samesite="lax",
            max_age=active.jwt_expire_minutes * 60,
            path="/",
        )

    def check_login_limit(request: Request) -> None:
        key = request.client.host if request.client else "unknown"
        now = time.monotonic()
        with app.state.login_lock:
            attempts = [
                stamp
                for stamp in app.state.login_attempts[key]
                if now - stamp < app.state.settings.login_window_seconds
            ]
            if len(attempts) >= app.state.settings.login_limit:
                app.state.login_attempts[key] = attempts
                raise HTTPException(
                    status_code=429,
                    detail={
                        "code": "rate_limited",
                        "message": "Забагато спроб. Спробуйте пізніше.",
                    },
                    headers={"Retry-After": str(app.state.settings.login_window_seconds)},
                )
            attempts.append(now)
            app.state.login_attempts[key] = attempts

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post(f"{API_PREFIX}/auth/register", response_model=dict, status_code=201)
    def register(
        payload: RegisterInput, response: Response, session: Session = Depends(get_session)
    ):
        if session.scalar(select(User.id).where(User.email == payload.email)):
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "registration_unavailable",
                    "message": "Не вдалося створити обліковий запис.",
                },
            )
        user = User(email=payload.email, password_hash=hash_password(payload.password))
        session.add(user)
        session.commit()
        session.refresh(user)
        set_auth_cookies(response, user)
        return {"id": user.id, "email": user.email, "created_at": user.created_at}

    @app.post(f"{API_PREFIX}/auth/login", response_model=dict)
    def login(
        payload: LoginInput,
        request: Request,
        response: Response,
        session: Session = Depends(get_session),
    ):
        check_login_limit(request)
        user = session.scalar(select(User).where(User.email == payload.email.strip().lower()))
        valid = verify_password(payload.password, user.password_hash) if user else False
        if not valid:
            raise HTTPException(
                status_code=401,
                detail={
                    "code": "invalid_credentials",
                    "message": "Невірна електронна адреса або пароль.",
                },
            )
        set_auth_cookies(response, user)
        return {"id": user.id, "email": user.email, "created_at": user.created_at}

    @app.post(f"{API_PREFIX}/auth/logout")
    def logout(response: Response):
        response.delete_cookie(
            "access_token",
            path="/",
            secure=app.state.settings.cookie_secure,
            httponly=True,
            samesite="lax",
        )
        response.delete_cookie(
            "csrf_token",
            path="/",
            secure=app.state.settings.cookie_secure,
            httponly=False,
            samesite="lax",
        )
        return {"message": "Ви вийшли з облікового запису."}

    @app.get(f"{API_PREFIX}/auth/csrf")
    def csrf_token(request: Request, response: Response) -> dict[str, str]:
        value = request.cookies.get("csrf_token")
        if not value:
            value = secrets.token_urlsafe(32)
            response.set_cookie(
                "csrf_token",
                value,
                httponly=False,
                secure=app.state.settings.cookie_secure,
                samesite="lax",
                max_age=app.state.settings.jwt_expire_minutes * 60,
                path="/",
            )
        return {"csrf_token": value}

    @app.get(f"{API_PREFIX}/auth/me")
    def me(user: User = Depends(current_user)):
        return {"id": user.id, "email": user.email, "created_at": user.created_at}

    @app.get(f"{API_PREFIX}/questionnaire")
    def questionnaire(session: Session = Depends(get_session)):
        template = session.scalar(select(Questionnaire).where(Questionnaire.active.is_(True)))
        if not template:
            raise HTTPException(
                status_code=503,
                detail={"code": "not_seeded", "message": "Шаблон анкети ще не завантажено."},
            )
        categories = session.scalars(select(Category).order_by(Category.position)).all()
        rows = session.execute(
            select(Question, Category, Recommendation)
            .join(Category, Question.category_id == Category.id)
            .join(Recommendation, Question.recommendation_id == Recommendation.id)
            .where(Question.questionnaire_id == template.id)
            .order_by(Question.position)
        ).all()
        return {
            "version": template.version,
            "categories": [
                {"slug": item.slug, "title": item.title, "position": item.position}
                for item in categories
            ],
            "questions": [_question_payload(*row) for row in rows],
        }

    @app.post(f"{API_PREFIX}/assessments", status_code=201)
    def create_assessment(
        profile: BusinessProfile,
        session: Session = Depends(get_session),
        user: User = Depends(current_user),
    ):
        template = session.scalar(select(Questionnaire).where(Questionnaire.active.is_(True)))
        if not template:
            raise HTTPException(
                status_code=503,
                detail={"code": "not_seeded", "message": "Шаблон анкети ще не завантажено."},
            )
        assessment = Assessment(
            user_id=user.id,
            questionnaire_id=template.id,
            company_name=profile.company_name,
            sector=profile.sector,
            employee_range=profile.employee_range,
            stores_customer_data=profile.stores_customer_data,
            uses_cloud=profile.uses_cloud,
        )
        session.add(assessment)
        session.commit()
        session.refresh(assessment)
        return {"id": assessment.id, "status": assessment.status, "current_question": 0}

    @app.get(f"{API_PREFIX}/assessments")
    def list_assessments(
        page: int = 1,
        page_size: int = 10,
        session: Session = Depends(get_session),
        user: User = Depends(current_user),
    ):
        if page < 1 or page_size < 1 or page_size > 50:
            raise HTTPException(
                status_code=422,
                detail={"code": "invalid_pagination", "message": "Некоректні параметри сторінки."},
            )
        query = (
            select(Assessment)
            .where(Assessment.user_id == user.id)
            .order_by(desc(Assessment.created_at))
        )
        total = session.scalar(
            select(func.count(Assessment.id)).where(Assessment.user_id == user.id)
        ) or 0
        if not app.state.settings.premium_enabled:
            page_size = 1
            page = 1
        items = session.scalars(query.offset((page - 1) * page_size).limit(page_size)).all()
        return {
            "items": [_assessment_summary(session, item) for item in items],
            "page": page,
            "page_size": page_size,
            "total": total if app.state.settings.premium_enabled else min(total, 1),
        }

    @app.get(f"{API_PREFIX}/assessments/{{assessment_id}}")
    def get_assessment(
        assessment_id: int,
        session: Session = Depends(get_session),
        user: User = Depends(current_user),
    ):
        assessment = _owned_assessment(session, user.id, assessment_id)
        answers = session.scalars(select(Answer).where(Answer.assessment_id == assessment.id)).all()
        return {
            "id": assessment.id,
            "company_name": assessment.company_name,
            "sector": assessment.sector,
            "employee_range": assessment.employee_range,
            "stores_customer_data": assessment.stores_customer_data,
            "uses_cloud": assessment.uses_cloud,
            "status": assessment.status,
            "current_question": assessment.current_question,
            "created_at": assessment.created_at,
            "completed_at": assessment.completed_at,
            "answers": {str(item.question_id): item.value for item in answers},
        }

    @app.put(f"{API_PREFIX}/assessments/{{assessment_id}}/answers")
    def save_answers(
        assessment_id: int,
        payload: AnswersUpdate,
        session: Session = Depends(get_session),
        user: User = Depends(current_user),
    ):
        assessment = _owned_assessment(session, user.id, assessment_id)
        if assessment.status != "draft":
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "assessment_completed",
                    "message": "Завершену анкету не можна змінити.",
                },
            )
        question_ids = [answer.question_id for answer in payload.answers]
        if len(set(question_ids)) != len(question_ids):
            raise HTTPException(
                status_code=422,
                detail={"code": "duplicate_answers", "message": "У запиті є повторні відповіді."},
            )
        valid_ids = set(
            session.scalars(
                select(Question.id).where(
                    Question.questionnaire_id == assessment.questionnaire_id,
                    Question.id.in_(question_ids),
                )
            ).all()
        )
        if valid_ids != set(question_ids):
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "invalid_question",
                    "message": "Одне з питань не належить цій анкеті.",
                },
            )
        existing = {
            item.question_id: item
            for item in session.scalars(
                select(Answer).where(
                    Answer.assessment_id == assessment.id,
                    Answer.question_id.in_(question_ids),
                )
            ).all()
        }
        for answer in payload.answers:
            if answer.question_id in existing:
                existing[answer.question_id].value = answer.value
            else:
                session.add(
                    Answer(
                        assessment_id=assessment.id,
                        question_id=answer.question_id,
                        value=answer.value,
                    )
                )
        assessment.current_question = payload.current_question
        session.commit()
        return {"saved": len(payload.answers), "current_question": assessment.current_question}

    @app.post(f"{API_PREFIX}/assessments/{{assessment_id}}/complete")
    def complete_assessment(
        assessment_id: int,
        session: Session = Depends(get_session),
        user: User = Depends(current_user),
    ):
        assessment = _owned_assessment(session, user.id, assessment_id)
        existing_result = _assessment_result(session, assessment)
        if existing_result:
            return result_payload(session, existing_result)
        rows = session.execute(
            select(Question, Category, Recommendation)
            .join(Category, Category.id == Question.category_id)
            .join(Recommendation, Recommendation.id == Question.recommendation_id)
            .where(Question.questionnaire_id == assessment.questionnaire_id)
            .order_by(Question.position)
        ).all()
        answers = {
            item.question_id: item.value
            for item in session.scalars(
                select(Answer).where(Answer.assessment_id == assessment.id)
            ).all()
        }
        expected_ids = {question.id for question, _category, _recommendation in rows}
        missing = expected_ids - set(answers)
        if missing:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "incomplete_assessment",
                    "message": "Дайте відповідь на всі питання, щоб отримати рейтинг.",
                },
            )
        grouped: dict[int, list[tuple[int, str]]] = defaultdict(list)
        for question, category, _recommendation in rows:
            grouped[category.id].append((question.weight, answers[question.id]))
        category_scores = {
            category.id: (category, category_score(grouped[category.id]))
            for category in {category.id: category for _q, category, _r in rows}.values()
        }
        total = overall_score(score for _category, score in category_scores.values())
        result = Result(
            assessment_id=assessment.id, total_score=total, risk_level=risk_level(total)
        )
        session.add(result)
        session.flush()
        for category_id, (_category, score) in category_scores.items():
            session.add(CategoryResult(result_id=result.id, category_id=category_id, score=score))
        if assessment.status == "draft":
            for question, _category, recommendation in rows:
                answer = answers[question.id]
                if answer == "yes":
                    continue
                priority = priority_for(question.weight, answer)
                session.add(
                    ActionItem(
                        assessment_id=assessment.id,
                        recommendation_id=recommendation.id,
                        question_id=question.id,
                        priority=priority,
                    )
                )
            assessment.status = "completed"
            assessment.completed_at = utcnow()
            assessment.current_question = len(rows)
        session.commit()
        session.refresh(result)
        return result_payload(session, result)

    def result_payload(session: Session, result: Result) -> dict:
        categories = _category_payload(session, result)
        weakest = sorted(categories, key=lambda item: (Decimal(str(item["score"])), item["title"]))[
            :3
        ]
        return {
            "assessment_id": result.assessment_id,
            "total_score": result.total_score,
            "risk_level": result.risk_level,
            "risk_label": RISK_LABELS[result.risk_level],
            "risk_color": RISK_COLORS[result.risk_level],
            "categories": categories,
            "weakest_categories": weakest,
            "created_at": result.created_at,
        }

    @app.get(f"{API_PREFIX}/assessments/{{assessment_id}}/result")
    def get_result(
        assessment_id: int,
        session: Session = Depends(get_session),
        user: User = Depends(current_user),
    ):
        assessment = _owned_assessment(session, user.id, assessment_id)
        result = _assessment_result(session, assessment)
        if not result:
            raise HTTPException(
                status_code=409,
                detail={"code": "result_unavailable", "message": "Спочатку завершіть анкету."},
            )
        return result_payload(session, result)

    @app.get(f"{API_PREFIX}/loss-scenarios")
    def list_loss_scenarios(session: Session = Depends(get_session)):
        scenarios = session.scalars(select(LossScenario).order_by(LossScenario.id)).all()
        return [
            {
                "id": item.id,
                "slug": item.slug,
                "title": item.title,
                "description": item.description,
                "assumptions": item.assumptions,
                "sources": item.sources,
                "defaults": item.defaults,
            }
            for item in scenarios
        ]

    @app.post(f"{API_PREFIX}/loss/calculate")
    def calculate_loss_endpoint(payload: LossCalculationInput):
        values = calculate_loss(payload.av, payload.ef, payload.aro)
        return {key: str(value) for key, value in values.items()}

    @app.get(f"{API_PREFIX}/assessments/{{assessment_id}}/loss-estimates")
    def get_loss_estimates(
        assessment_id: int,
        session: Session = Depends(get_session),
        user: User = Depends(current_user),
    ):
        assessment = _owned_assessment(session, user.id, assessment_id)
        scenarios = session.scalars(select(LossScenario).order_by(LossScenario.id)).all()
        estimates = session.scalars(
            select(LossEstimate).where(LossEstimate.assessment_id == assessment.id)
        ).all()
        items = [_loss_payload(assessment, scenario, estimates) for scenario in scenarios]
        total_ale = sum(
            (
                Decimal(str(variant["ale"]))
                for item in items
                for variant in item["variants"]
                if variant["variant"] == "base"
            ),
            Decimal("0"),
        )
        return {"items": items, "total_ale": total_ale}

    @app.put(f"{API_PREFIX}/assessments/{{assessment_id}}/loss-estimates")
    def update_loss_estimates(
        assessment_id: int,
        payload: LossEstimatesUpdate,
        session: Session = Depends(get_session),
        user: User = Depends(current_user),
    ):
        assessment = _owned_assessment(session, user.id, assessment_id)
        keys = [(row.scenario_id, row.variant) for row in payload.estimates]
        if len(set(keys)) != len(keys):
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "duplicate_estimates",
                    "message": "У запиті є повторні варіанти сценарію.",
                },
            )
        scenarios = set(
            session.scalars(
                select(LossScenario.id).where(
                    LossScenario.id.in_({row.scenario_id for row in payload.estimates})
                )
            ).all()
        )
        if any(row.scenario_id not in scenarios for row in payload.estimates):
            raise HTTPException(
                status_code=422,
                detail={"code": "invalid_scenario", "message": "Сценарій збитків не знайдено."},
            )
        for row in payload.estimates:
            values = calculate_loss(row.av, row.ef, row.aro)
            item = session.scalar(
                select(LossEstimate).where(
                    LossEstimate.assessment_id == assessment.id,
                    LossEstimate.scenario_id == row.scenario_id,
                    LossEstimate.variant == row.variant,
                )
            )
            if item is None:
                item = LossEstimate(
                    assessment_id=assessment.id,
                    scenario_id=row.scenario_id,
                    variant=row.variant,
                    **values,
                )
                session.add(item)
            else:
                for key, value in values.items():
                    setattr(item, key, value)
        session.commit()
        return get_loss_estimates(assessment_id, session, user)

    @app.get(f"{API_PREFIX}/assessments/{{assessment_id}}/action-plan")
    def get_action_plan(
        assessment_id: int,
        session: Session = Depends(get_session),
        user: User = Depends(current_user),
    ):
        assessment = _owned_assessment(session, user.id, assessment_id)
        rows = session.execute(
            select(ActionItem, Recommendation, Question)
            .join(Recommendation, Recommendation.id == ActionItem.recommendation_id)
            .join(Question, Question.id == ActionItem.question_id)
            .where(ActionItem.assessment_id == assessment.id)
            .order_by(desc(ActionItem.priority), ActionItem.id)
        ).all()
        return {"items": [_recommendation_payload(*row) for row in rows]}

    @app.patch(f"{API_PREFIX}/assessments/{{assessment_id}}/action-items/{{item_id}}")
    def update_action_item(
        assessment_id: int,
        item_id: int,
        payload: ActionItemPatch,
        session: Session = Depends(get_session),
        user: User = Depends(current_user),
    ):
        assessment = _owned_assessment(session, user.id, assessment_id)
        item = session.scalar(
            select(ActionItem).where(
                ActionItem.id == item_id, ActionItem.assessment_id == assessment.id
            )
        )
        if item is None:
            raise _not_found()
        fields = payload.model_fields_set
        for field in fields:
            value = getattr(payload, field)
            if field == "assignee" and value is not None:
                value = value.strip()
            setattr(item, field, value)
        session.commit()
        rec = session.get(Recommendation, item.recommendation_id)
        question = session.get(Question, item.question_id)
        return _recommendation_payload(item, rec, question)

    @app.get(f"{API_PREFIX}/microlessons")
    def get_microlessons(session: Session = Depends(get_session)):
        rows = session.execute(
            select(Microlesson, Category)
            .join(Category, Category.id == Microlesson.category_id)
            .order_by(Category.position)
        ).all()
        return [
            {
                "slug": lesson.slug,
                "title": lesson.title,
                "category": {"slug": category.slug, "title": category.title},
                "body": lesson.body,
                "takeaways": lesson.takeaways,
                "recommendation_slugs": lesson.recommendation_slugs,
            }
            for lesson, category in rows
        ]

    @app.get(f"{API_PREFIX}/microlessons/{{slug}}")
    def get_microlesson(slug: str, session: Session = Depends(get_session)):
        row = session.execute(
            select(Microlesson, Category)
            .join(Category, Category.id == Microlesson.category_id)
            .where(Microlesson.slug == slug)
        ).first()
        if not row:
            raise _not_found()
        lesson, category = row
        return {
            "slug": lesson.slug,
            "title": lesson.title,
            "category": {"slug": category.slug, "title": category.title},
            "body": lesson.body,
            "takeaways": lesson.takeaways,
            "recommendation_slugs": lesson.recommendation_slugs,
        }

    @app.get(f"{API_PREFIX}/quiz")
    def get_quiz(session: Session = Depends(get_session)):
        rows = session.execute(
            select(QuizQuestion, Category)
            .join(Category, Category.id == QuizQuestion.category_id)
            .order_by(QuizQuestion.position)
        ).all()
        return [
            {
                "id": question.id,
                "slug": question.slug,
                "sender": question.sender,
                "subject": question.subject,
                "body": question.body,
                "category": category.title,
            }
            for question, category in rows
        ]

    @app.post(f"{API_PREFIX}/quiz/submit")
    def submit_quiz(
        payload: QuizSubmit,
        session: Session = Depends(get_session),
        user: User = Depends(current_user),
    ):
        ids = [item.question_id for item in payload.answers]
        if len(set(ids)) != len(ids):
            raise HTTPException(
                status_code=422,
                detail={"code": "invalid_quiz", "message": "У відповіді є повторне питання."},
            )
        questions = session.scalars(select(QuizQuestion).where(QuizQuestion.id.in_(ids))).all()
        if len(questions) != 12:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "invalid_quiz",
                    "message": "Вікторина містить неактуальні питання.",
                },
            )
        submitted = {item.question_id: item.is_phishing for item in payload.answers}
        details = []
        score = 0
        for question in sorted(questions, key=lambda row: row.position):
            correct = submitted[question.id] == question.is_phishing
            score += int(correct)
            details.append(
                {
                    "question_id": question.id,
                    "correct": correct,
                    "is_phishing": question.is_phishing,
                    "explanation": question.explanation,
                }
            )
        attempt_id = None
        complete = len(payload.answers) == 12
        if complete:
            attempt = QuizAttempt(
                user_id=user.id,
                score=score,
                total=12,
                answers={str(key): value for key, value in submitted.items()},
            )
            session.add(attempt)
            session.commit()
            attempt_id = attempt.id
        return {
            "attempt_id": attempt_id,
            "score": score,
            "total": len(payload.answers) if not complete else 12,
            "completed": complete,
            "details": details,
        }

    @app.get(f"{API_PREFIX}/assessments/{{assessment_id}}/report")
    def get_report(
        assessment_id: int,
        session: Session = Depends(get_session),
        user: User = Depends(current_user),
    ):
        if not app.state.settings.premium_enabled:
            raise HTTPException(
                status_code=403,
                detail={"code": "premium_required", "message": "Звіт доступний у Premium."},
            )
        assessment = _owned_assessment(session, user.id, assessment_id)
        result = _assessment_result(session, assessment)
        if not result:
            raise HTTPException(
                status_code=409,
                detail={"code": "result_unavailable", "message": "Спочатку завершіть анкету."},
            )
        losses = get_loss_estimates(assessment_id, session, user)
        action_plan = get_action_plan(assessment_id, session, user)
        return {
            "business": {
                "company_name": assessment.company_name,
                "sector": assessment.sector,
                "employee_range": assessment.employee_range,
                "stores_customer_data": assessment.stores_customer_data,
                "uses_cloud": assessment.uses_cloud,
            },
            "date": assessment.completed_at or assessment.created_at,
            "result": result_payload(session, result),
            "losses": losses,
            "action_plan": action_plan,
        }

    @app.get(f"{API_PREFIX}/dashboard")
    def dashboard(
        session: Session = Depends(get_session),
        user: User = Depends(current_user),
    ):
        assessments = session.scalars(
            select(Assessment)
            .where(Assessment.user_id == user.id)
            .order_by(desc(Assessment.created_at))
        ).all()
        visible = assessments if app.state.settings.premium_enabled else assessments[:1]
        summaries = [_assessment_summary(session, item) for item in visible]
        completed_summaries = [item for item in summaries if item["status"] == "completed"]
        latest = next((item for item in assessments if item.status == "completed"), None)
        categories = []
        if latest:
            result = _assessment_result(session, latest)
            if result:
                categories = _category_payload(session, result)
        total_actions = sum(row["action_total"] for row in summaries)
        completed_actions = sum(row["action_done"] for row in summaries)
        return {
            "assessments": summaries,
            "history_enabled": app.state.settings.premium_enabled,
            "latest_categories": categories,
            "total_ale": completed_summaries[0]["total_ale"]
            if completed_summaries
            else Decimal("0"),
            "action_progress": {
                "done": completed_actions,
                "total": total_actions,
                "percent": round(completed_actions / total_actions * 100) if total_actions else 0,
            },
            "comparison": {
                "current": completed_summaries[0] if completed_summaries else None,
                "previous": completed_summaries[1] if len(completed_summaries) > 1 else None,
            },
        }

    return app


app = create_app()
