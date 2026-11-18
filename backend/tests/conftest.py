import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.models import Base
from app.seed import seed_all


@pytest.fixture
def app(tmp_path):
    database_path = tmp_path / "test.sqlite"
    test_app = create_app(
        database_url=f"sqlite:///{database_path.as_posix()}",
        secret_key="unit-test-secret-with-more-than-thirty-two-bytes",
        cookie_secure=False,
    )
    Base.metadata.create_all(test_app.state.engine)
    with test_app.state.session_factory() as session:
        seed_all(session)
    yield test_app
    test_app.state.engine.dispose()


@pytest.fixture
def client(app):
    with TestClient(app, base_url="https://testserver") as test_client:
        yield test_client


def register(client, email="owner@example.com", password="very-safe-passphrase"):
    response = client.post("/api/v1/auth/register", json={"email": email, "password": password})
    assert response.status_code == 201
    token = client.get("/api/v1/auth/csrf").json()["csrf_token"]
    client.headers.update({"X-CSRF-Token": token})
    return response.json()
