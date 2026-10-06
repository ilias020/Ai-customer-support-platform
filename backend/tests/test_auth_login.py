import hashlib
import hmac
import json
import logging
from datetime import UTC, datetime, timedelta
from http.cookies import SimpleCookie

import jwt
import pytest
from sqlalchemy import func, select

from app.core.config import settings
from app.core.logging import JsonFormatter
from app.modules.auth import service as auth_service
from app.modules.auth.models import UserSession
from app.modules.auth.router import REFRESH_TOKEN_COOKIE_NAME
from app.modules.users.models import User, UserStatus

LOGIN_URL = "/api/auth/login"
EMAIL = "user@example.com"
PASSWORD = "Correct-Horse-Battery-1"


def login(api_client, email=EMAIL, password=PASSWORD, **kwargs):
    return api_client.post(LOGIN_URL, json={"email": email, "password": password}, **kwargs)


def session_count(db_session) -> int:
    return db_session.scalar(select(func.count()).select_from(UserSession))


def refresh_cookie(response) -> SimpleCookie:
    cookie = SimpleCookie()
    cookie.load(response.headers["set-cookie"])
    return cookie


def assert_error(response, status_code: int, code: str) -> dict:
    assert response.status_code == status_code
    body = response.json()
    assert body["error"]["code"] == code
    assert body["request_id"] == response.headers["X-Request-ID"]
    return body


# Happy path


def test_successful_login_returns_access_token(api_client, create_user):
    user = create_user()

    response = login(api_client)

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"access_token", "token_type", "expires_in"}
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 900

    claims = jwt.decode(body["access_token"], settings.jwt_secret_key, algorithms=["HS256"])
    assert claims["sub"] == str(user.id)
    assert claims["token_type"] == "access"
    assert claims["exp"] - claims["iat"] == 15 * 60


def test_refresh_token_is_not_returned_in_json(api_client, create_user):
    create_user()

    response = login(api_client)

    token = refresh_cookie(response)[REFRESH_TOKEN_COOKIE_NAME].value
    assert token not in response.text
    assert "refresh_token" not in response.json()


def test_refresh_token_cookie_attributes(api_client, create_user):
    create_user()

    response = login(api_client)

    set_cookie = response.headers["set-cookie"]
    morsel = refresh_cookie(response)[REFRESH_TOKEN_COOKIE_NAME]
    assert len(morsel.value) >= 43
    assert morsel["httponly"] is True
    assert morsel["samesite"].lower() == "lax"
    assert morsel["path"] == "/api/auth"
    assert morsel["max-age"] == str(30 * 24 * 60 * 60)
    assert morsel["domain"] == ""
    assert "secure" not in set_cookie.lower()


def test_refresh_token_cookie_is_secure_in_production(api_client, create_user, monkeypatch):
    create_user()
    monkeypatch.setattr(settings, "environment", "production")

    response = login(api_client)

    assert refresh_cookie(response)[REFRESH_TOKEN_COOKIE_NAME]["secure"] is True


def test_successful_login_stores_hashed_user_session(api_client, create_user, db_session):
    user = create_user()
    before_login = datetime.now(UTC)

    response = login(api_client)

    refresh_token = refresh_cookie(response)[REFRESH_TOKEN_COOKIE_NAME].value
    sessions = db_session.scalars(select(UserSession)).all()
    assert len(sessions) == 1
    user_session = sessions[0]
    expected_hash = hmac.new(
        settings.refresh_token_hash_key.encode(),
        refresh_token.encode(),
        hashlib.sha256,
    ).hexdigest()
    assert user_session.user_id == user.id
    assert user_session.token_hash == expected_hash
    assert user_session.token_hash != refresh_token
    assert user_session.revoked_at is None
    expected_expiry = before_login + timedelta(days=30)
    assert abs(user_session.expires_at - expected_expiry) < timedelta(seconds=30)


def test_successful_login_updates_last_login_at(api_client, create_user, db_session):
    user = create_user()
    assert user.last_login_at is None
    before_login = datetime.now(UTC)

    login(api_client)

    db_session.expire_all()
    stored_user = db_session.get(User, user.id)
    assert stored_user.last_login_at is not None
    assert stored_user.last_login_at.tzinfo is not None
    assert before_login <= stored_user.last_login_at <= datetime.now(UTC)


def test_login_normalizes_email_before_lookup(api_client, create_user):
    create_user(email=EMAIL)

    response = login(api_client, email="  User@Example.COM ")

    assert response.status_code == 200


def test_password_is_not_trimmed(api_client, create_user):
    create_user(password=" padded password ")

    assert login(api_client, password=" padded password ").status_code == 200
    assert login(api_client, password="padded password").status_code == 401


# Unhappy paths: invalid credentials


@pytest.mark.parametrize(
    ("email", "password", "status"),
    [
        (EMAIL, "Wrong-Password-1", UserStatus.ACTIVE),
        ("unknown@example.com", PASSWORD, UserStatus.ACTIVE),
        (EMAIL, PASSWORD, UserStatus.INACTIVE),
    ],
    ids=["wrong-password", "unknown-email", "inactive-user"],
)
def test_invalid_credentials_return_generic_401(
    api_client, create_user, db_session, email, password, status
):
    user = create_user(status=status)

    response = login(api_client, email=email, password=password)

    body = assert_error(response, 401, "INVALID_CREDENTIALS")
    assert body["error"]["message"] == "Invalid email or password."
    assert "set-cookie" not in response.headers
    assert session_count(db_session) == 0
    db_session.expire_all()
    assert db_session.get(User, user.id).last_login_at is None


def test_invalid_credential_responses_are_identical(api_client, create_user):
    create_user()
    create_user(email="inactive@example.com", status=UserStatus.INACTIVE)

    responses = [
        login(api_client, password="Wrong-Password-1"),
        login(api_client, email="unknown@example.com"),
        login(api_client, email="inactive@example.com"),
    ]

    assert {r.status_code for r in responses} == {401}
    assert len({json.dumps(r.json()["error"], sort_keys=True) for r in responses}) == 1


# Unhappy paths: validation


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"email": EMAIL},
        {"password": PASSWORD},
        {"email": "not-an-email", "password": PASSWORD},
        {"email": "   ", "password": PASSWORD},
        {"email": EMAIL, "password": ""},
        {"email": EMAIL, "password": 12345},
        {"email": EMAIL, "password": "x" * 1025},
    ],
    ids=[
        "empty",
        "missing-password",
        "missing-email",
        "invalid-email",
        "blank-email",
        "empty-password",
        "non-string-password",
        "too-long-password",
    ],
)
def test_invalid_input_returns_422_without_login(
    api_client, create_user, db_session, monkeypatch, payload
):
    create_user()

    def fail_verification(*args, **kwargs):
        raise AssertionError("Password verification must not run for invalid input")

    monkeypatch.setattr(auth_service, "verify_password", fail_verification)
    monkeypatch.setattr(auth_service, "verify_dummy_password", fail_verification)

    response = api_client.post(LOGIN_URL, json=payload)

    body = assert_error(response, 422, "VALIDATION_ERROR")
    assert body["error"]["details"]
    assert "x" * 100 not in response.text
    assert "set-cookie" not in response.headers
    assert session_count(db_session) == 0


def test_maximum_length_password_is_accepted_for_verification(api_client, create_user):
    password = "p" * 1024
    create_user(password=password)

    assert login(api_client, password=password).status_code == 200


def test_validation_error_does_not_echo_password(api_client):
    secret_password = "Very-Secret-Password-Value-1"

    response = api_client.post(
        LOGIN_URL,
        json={"email": "not-an-email", "password": secret_password},
    )

    assert response.status_code == 422
    assert secret_password not in response.text


def test_malformed_json_returns_422(api_client):
    response = api_client.post(
        LOGIN_URL,
        content="{not json",
        headers={"Content-Type": "application/json"},
    )

    assert_error(response, 422, "VALIDATION_ERROR")


# Unhappy paths: internal errors


def test_session_creation_failure_returns_500_and_rolls_back(
    api_client, create_user, db_session, monkeypatch
):
    user = create_user()

    def fail_session_creation(*args, **kwargs):
        raise RuntimeError("session storage unavailable: internal-detail")

    monkeypatch.setattr(auth_service, "create_user_session", fail_session_creation)

    response = login(api_client)

    body = assert_error(response, 500, "INTERNAL_SERVER_ERROR")
    assert body["error"]["message"] == "An unexpected error occurred."
    assert "internal-detail" not in response.text
    assert "set-cookie" not in response.headers
    assert session_count(db_session) == 0
    db_session.expire_all()
    assert db_session.get(User, user.id).last_login_at is None


def test_commit_failure_returns_500_and_rolls_back(
    api_client, create_user, db_session, monkeypatch
):
    user = create_user()

    def fail_commit():
        raise RuntimeError("commit failed: internal-detail")

    monkeypatch.setattr(db_session, "commit", fail_commit)

    response = login(api_client)

    assert_error(response, 500, "INTERNAL_SERVER_ERROR")
    assert "internal-detail" not in response.text
    assert session_count(db_session) == 0
    db_session.expire_all()
    assert db_session.get(User, user.id).last_login_at is None


def test_unexpected_lookup_error_returns_safe_500(api_client, monkeypatch):
    def fail_lookup(*args, **kwargs):
        raise RuntimeError("database host db.internal unreachable")

    monkeypatch.setattr(auth_service, "get_user_by_email", fail_lookup)

    response = login(api_client)

    assert_error(response, 500, "INTERNAL_SERVER_ERROR")
    assert "db.internal" not in response.text


# Rate limiting


def test_login_is_rate_limited_per_client_ip(api_client, create_user, db_session):
    create_user()

    for _ in range(5):
        assert login(api_client, password="Wrong-Password-1").status_code == 401

    response = login(api_client)

    assert_error(response, 429, "RATE_LIMIT_EXCEEDED")
    assert 1 <= int(response.headers["Retry-After"]) <= 60
    assert "set-cookie" not in response.headers
    assert session_count(db_session) == 0


def test_rate_limit_counts_invalid_requests(api_client):
    for _ in range(5):
        assert api_client.post(LOGIN_URL, json={}).status_code == 422

    assert login(api_client).status_code == 429


def test_rate_limit_is_separate_per_client_ip(db_session, create_user):
    from fastapi.testclient import TestClient

    from app.database.session import get_db
    from app.main import app

    create_user()

    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    try:
        first_client = TestClient(app, client=("203.0.113.10", 50000))
        second_client = TestClient(app, client=("203.0.113.20", 50000))

        for _ in range(5):
            login(first_client, password="Wrong-Password-1")

        assert login(first_client).status_code == 429
        assert login(second_client).status_code == 200
    finally:
        app.dependency_overrides.pop(get_db, None)


# Logging


def test_login_logging_contains_no_sensitive_data(api_client, create_user, caplog):
    create_user()
    caplog.set_level(logging.INFO)

    success = login(api_client)
    failure = login(api_client, password="Wrong-Password-1")

    refresh_token = refresh_cookie(success)[REFRESH_TOKEN_COOKIE_NAME].value
    access_token = success.json()["access_token"]
    refresh_token_hash = hmac.new(
        settings.refresh_token_hash_key.encode(),
        refresh_token.encode(),
        hashlib.sha256,
    ).hexdigest()

    formatter = JsonFormatter()
    output = "\n".join(formatter.format(record) for record in caplog.records)
    for sensitive in (
        PASSWORD,
        "Wrong-Password-1",
        refresh_token,
        refresh_token_hash,
        access_token,
        EMAIL,
        "$argon2",
        settings.jwt_secret_key,
        settings.refresh_token_hash_key,
    ):
        assert sensitive not in output

    events = {record.event: record for record in caplog.records if hasattr(record, "event")}
    success_record = events["LOGIN_SUCCESS"]
    assert success_record.request_id == success.headers["X-Request-ID"]
    assert success_record.user_id
    assert success_record.session_id

    failed_record = events["LOGIN_FAILED"]
    assert failed_record.request_id == failure.headers["X-Request-ID"]
    assert failed_record.failure_reason == "INVALID_CREDENTIALS"
