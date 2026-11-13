import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app


@pytest.fixture
def client(tmp_path):
    database = tmp_path / "test.db"
    test_engine = create_engine(
        f"sqlite:///{database}",
        connect_args={"check_same_thread": False},
        future=True,
    )
    Base.metadata.create_all(bind=test_engine)
    test_session = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)

    def override_get_db():
        db = test_session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client, test_session
    app.dependency_overrides.clear()
    test_engine.dispose()


def register(client, email="owner@example.com", tenant="Example Workspace"):
    response = client.post("/api/auth/register", json={
        "email": email,
        "password": "test-password-123",
        "display_name": "Test Owner",
        "tenant_name": tenant,
    })
    assert response.status_code == 201, response.text
    return response.json()


def auth_headers(auth_response):
    return {"Authorization": f"Bearer {auth_response['access_token']}"}
