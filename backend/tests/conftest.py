import os
from pathlib import Path

import pytest
from dotenv import dotenv_values
from sqlalchemy.engine import make_url

BACKEND_DIRECTORY = Path(__file__).resolve().parents[1]

env_values = dotenv_values(BACKEND_DIRECTORY / ".env")
test_database_url = os.getenv("TEST_DATABASE_URL") or env_values.get("TEST_DATABASE_URL")

if not test_database_url:
    raise RuntimeError(
        "TEST_DATABASE_URL is required to run the test suite. "
        "Configure an isolated PostgreSQL test database."
    )

if make_url(test_database_url).database != "ai_customer_support_test":
    raise RuntimeError("TEST_DATABASE_URL must point to the isolated Nimbus test database.")

os.environ["ENVIRONMENT"] = "testing"
os.environ["DATABASE_URL"] = test_database_url
# Test-only placeholder values; never used outside the isolated test environment.
os.environ.setdefault("JWT_SECRET_KEY", "test-only-jwt-signing-placeholder-value-0000")
os.environ.setdefault("REFRESH_TOKEN_HASH_KEY", "test-only-refresh-hash-placeholder-value-0000")


@pytest.fixture(autouse=True)
def reset_auth_rate_limiters():
    from app.modules.auth.router import login_rate_limiter, refresh_rate_limiter

    login_rate_limiter.reset()
    refresh_rate_limiter.reset()
    yield
    login_rate_limiter.reset()
    refresh_rate_limiter.reset()


@pytest.fixture
def db_session():
    """Database session whose changes are rolled back after each test.

    Application commits release a SAVEPOINT instead of committing the outer transaction.
    """
    from sqlalchemy.orm import Session

    from app.database.session import engine

    connection = engine.connect()
    transaction = connection.begin()
    session = Session(
        bind=connection,
        autoflush=False,
        join_transaction_mode="create_savepoint",
    )
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def api_client(db_session):
    from fastapi.testclient import TestClient

    from app.database.session import get_db
    from app.main import app

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app, raise_server_exceptions=False)
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def create_user(db_session):
    from app.core.security import hash_password
    from app.modules.users.models import User, UserStatus

    def _create_user(
        email: str = "user@example.com",
        password: str = "Correct-Horse-Battery-1",
        status: str = UserStatus.ACTIVE,
    ) -> User:
        user = User(
            first_name="Test",
            last_name="User",
            email=email,
            password_hash=hash_password(password),
            status=status,
        )
        db_session.add(user)
        # Releases the test SAVEPOINT so the user exists before the request under test,
        # matching a committed user in a real database.
        db_session.commit()
        return user

    return _create_user
