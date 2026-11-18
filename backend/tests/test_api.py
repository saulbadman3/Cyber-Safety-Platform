from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models import User
from tests.conftest import register


def csrf(client):
    value = client.get("/api/v1/auth/csrf").json()["csrf_token"]
    client.headers.update({"X-CSRF-Token": value})


def test_auth_cookie_and_uniform_login_error(client, app):
    registered = register(client)
    cookie_header = client.cookies.get("access_token")
    assert cookie_header
    assert "access_token" in client.cookies
    with app.state.session_factory() as session:
        user = session.scalar(select(User).where(User.email == registered["email"]))
        assert user.password_hash != "very-safe-passphrase"
        assert user.password_hash.startswith("$argon2id$")
    assert client.get("/api/v1/auth/me").status_code == 200

    wrong_existing = client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.com", "password": "incorrect-password"},
    )
    wrong_missing = client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "incorrect-password"},
    )
    assert wrong_existing.status_code == wrong_missing.status_code == 401
    assert wrong_existing.json()["error"] == wrong_missing.json()["error"]


def test_registration_password_validation(client):
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "short@example.com", "password": "short"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_csrf_required_for_authenticated_writes(client):
    register(client)
    client.headers.pop("X-CSRF-Token")
    response = client.post(
        "/api/v1/assessments",
        json={
            "company_name": "Пекарня",
            "sector": "Харчування",
            "employee_range": "1-5",
            "stores_customer_data": True,
            "uses_cloud": True,
        },
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "csrf_failed"


def test_login_rate_limit():
    from fastapi.testclient import TestClient

    from app.config import Settings
    from app.main import create_app
    from app.models import Base

    app = create_app(
        settings=Settings(login_limit=2, login_window_seconds=60),
        database_url="sqlite://",
        secret_key="rate-limit-secret-with-more-than-thirty-two-bytes",
        cookie_secure=False,
    )
    Base.metadata.create_all(app.state.engine)
    with TestClient(app, base_url="https://testserver") as client:
        for _ in range(2):
            assert (
                client.post(
                    "/api/v1/auth/login",
                    json={"email": "nobody@example.com", "password": "incorrect-password"},
                ).status_code
                == 401
            )
        assert (
            client.post(
                "/api/v1/auth/login",
                json={"email": "nobody@example.com", "password": "incorrect-password"},
            ).status_code
            == 429
        )
    app.state.engine.dispose()


def test_full_audit_flow_and_owner_isolation(client):
    register(client)
    questionnaire = client.get("/api/v1/questionnaire").json()
    assert len(questionnaire["categories"]) == 8
    assert len(questionnaire["questions"]) == 14
    assessment = client.post(
        "/api/v1/assessments",
        json={
            "company_name": "Майстерня",
            "sector": "Послуги",
            "employee_range": "6-20",
            "stores_customer_data": True,
            "uses_cloud": True,
        },
    )
    assert assessment.status_code == 201
    assessment_id = assessment.json()["id"]

    answers = []
    for index, question in enumerate(questionnaire["questions"]):
        value = "yes"
        if index == 0:
            value = "partial"
        elif index == 1:
            value = "no"
        elif index == 2:
            value = "unknown"
        answers.append({"question_id": question["id"], "value": value})
    saved = client.put(
        f"/api/v1/assessments/{assessment_id}/answers",
        json={"answers": answers, "current_question": 14},
    )
    assert saved.status_code == 200
    completed = client.post(f"/api/v1/assessments/{assessment_id}/complete")
    assert completed.status_code == 200
    assert 0 <= completed.json()["total_score"] <= 100
    assert len(completed.json()["categories"]) == 8
    assert len(completed.json()["weakest_categories"]) == 3

    defaults = client.get(f"/api/v1/assessments/{assessment_id}/loss-estimates")
    assert defaults.status_code == 200
    backup = next(item for item in defaults.json()["items"] if item["slug"] == "backup-loss")
    assert backup["variants"][1]["ale"] == "10000.00"
    saved_estimates = client.put(
        f"/api/v1/assessments/{assessment_id}/loss-estimates",
        json={
            "estimates": [
                {
                    "scenario_id": backup["id"],
                    "variant": "base",
                    "av": 100000,
                    "ef": 0.25,
                    "aro": 0,
                }
            ]
        },
    )
    assert saved_estimates.status_code == 200
    updated_backup = next(
        item for item in saved_estimates.json()["items"] if item["slug"] == "backup-loss"
    )
    assert updated_backup["variants"][1]["ale"] == "0.00"

    action_plan = client.get(f"/api/v1/assessments/{assessment_id}/action-plan").json()
    assert len(action_plan["items"]) == 3
    first_action = action_plan["items"][0]
    updated_action = client.patch(
        f"/api/v1/assessments/{assessment_id}/action-items/{first_action['id']}",
        json={"status": "in_progress", "assignee": "Власник"},
    )
    assert updated_action.status_code == 200
    assert updated_action.json()["status"] == "in_progress"
    assert client.get(f"/api/v1/assessments/{assessment_id}/report").status_code == 200
    assert client.get("/api/v1/dashboard").status_code == 200

    stranger = TestClient(client.app, base_url="https://testserver")
    register(stranger, "stranger@example.com")
    assert stranger.get(f"/api/v1/assessments/{assessment_id}").status_code == 404
    assert stranger.get(f"/api/v1/assessments/{assessment_id}/result").status_code == 404
    stranger.close()


def test_incomplete_and_invalid_answers_are_rejected(client):
    register(client)
    item = client.post(
        "/api/v1/assessments",
        json={
            "company_name": "Крамниця",
            "sector": "Роздріб",
            "employee_range": "1-5",
            "stores_customer_data": False,
            "uses_cloud": False,
        },
    ).json()
    assert client.post(f"/api/v1/assessments/{item['id']}/complete").status_code == 422
    bad = client.put(
        f"/api/v1/assessments/{item['id']}/answers",
        json={"answers": [{"question_id": 9999, "value": "yes"}], "current_question": 1},
    )
    assert bad.status_code == 422


def test_loss_api_validation_and_quiz(client):
    register(client)
    invalid = client.post("/api/v1/loss/calculate", json={"av": 100, "ef": 1.1, "aro": 0.5})
    assert invalid.status_code == 422
    assert (
        client.post(
            "/api/v1/loss/calculate",
            json={"av": 100000, "ef": 0.2, "aro": 0},
        ).json()["ale"]
        == "0.00"
    )
    quiz = client.get("/api/v1/quiz").json()
    assert len(quiz) == 12
    assert "is_phishing" not in quiz[0]
    submitted = client.post(
        "/api/v1/quiz/submit",
        json={
            "answers": [
                {"question_id": question["id"], "is_phishing": index % 2 == 0}
                for index, question in enumerate(quiz)
            ]
        },
    )
    assert submitted.status_code == 200
    assert submitted.json()["total"] == 12
    assert len(submitted.json()["details"]) == 12
