import logging
import threading
import uuid
from datetime import UTC, datetime, timedelta
from http.cookies import SimpleCookie

import jwt
import pytest
from sqlalchemy import delete, select

from app.core.config import settings
from app.core.logging import JsonFormatter
from app.core.security import generate_refresh_token, hash_password, hash_refresh_token
from app.database.session import SessionLocal
from app.modules.auth import service as auth_service
from app.modules.auth.exceptions import InvalidRefreshTokenError
from app.modules.auth.models import UserSession
from app.modules.auth.repository import rotate_user_session_token
from app.modules.auth.router import REFRESH_RATE_LIMIT_ATTEMPTS, REFRESH_TOKEN_COOKIE_NAME
from app.modules.users.models import User, UserStatus

REFRESH_URL = "/api/auth/refresh"


@pytest.fixture
def create_session(db_session):
    """Creates a UserSession for `user` and returns the raw refresh token."""

    def _create_session(
        user: User,
        *,
        expires_at: datetime | None = None,
        revoked_at: datetime | None = None,
    ) -> str:
        refresh_token = generate_refresh_token()
        db_session.add(
            UserSession(
                id=uuid.uuid4(),
                user_id=user.id,
                token_hash=hash_refresh_token(refresh_token),
                expires_at=expires_at or datetime.now(UTC) + timedelta(days=30),
                revoked_at=revoked_at,
            )
        )
        db_session.commit()
        return refresh_token

    return _create_session


def refresh(api_client, refresh_token: str | None):
    api_client.cookies.clear()
    if refresh_token is not None:
        api_client.cookies.set(REFRESH_TOKEN_COOKIE_NAME, refresh_token)
    return api_client.post(REFRESH_URL)


def response_refresh_cookie(response):
    cookie = SimpleCookie()
    cookie.load(response.headers["set-cookie"])
    return cookie[REFRESH_TOKEN_COOKIE_NAME]


def stored_session(db_session, refresh_token: str) -> UserSession | None:
    db_session.expire_all()
    return db_session.scalar(
        select(UserSession).where(UserSession.token_hash == hash_refresh_token(refresh_token))
    )


def assert_invalid_refresh(response):
    assert response.status_code == 401
    body = response.json()
    assert body["error"]["code"] == "INVALID_REFRESH_TOKEN"
    assert body["request_id"] == response.headers["X-Request-ID"]
    assert "set-cookie" not in response.headers
    assert "access_token" not in body


# Happy path


def test_valid_refresh_returns_new_access_token(api_client, create_user, create_session):
    user = create_user()
    refresh_token = create_session(user)

    response = refresh(api_client, refresh_token)

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"access_token", "token_type", "expires_in"}
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 900
    claims = jwt.decode(body["access_token"], settings.jwt_secret_key, algorithms=["HS256"])
    assert claims["sub"] == str(user.id)
    assert claims["token_type"] == "access"
    assert claims["exp"] - claims["iat"] == 900


def test_refresh_rotates_refresh_token(api_client, create_user, create_session, db_session):
    user = create_user()
    old_token = create_session(user)
    session_before = stored_session(db_session, old_token)

    response = refresh(api_client, old_token)

    cookie = response_refresh_cookie(response)
    new_token = cookie.value
    assert new_token != old_token
    assert len(new_token) >= 43
    assert new_token not in response.text
    assert cookie["httponly"] is True
    assert cookie["samesite"].lower() == "lax"
    assert cookie["path"] == "/api/auth"
    assert cookie["domain"] == ""

    assert stored_session(db_session, old_token) is None
    rotated = stored_session(db_session, new_token)
    assert rotated is not None
    assert rotated.id == session_before.id
    assert rotated.token_hash == hash_refresh_token(new_token)
    assert rotated.token_hash != new_token


def test_rotated_refresh_token_can_be_used_again(api_client, create_user, create_session):
    old_token = create_session(create_user())
    new_token = response_refresh_cookie(refresh(api_client, old_token)).value

    response = refresh(api_client, new_token)

    assert response.status_code == 200
    assert response_refresh_cookie(response).value not in {old_token, new_token}


def test_refresh_works_with_cookie_from_login(api_client, create_user):
    create_user()

    login_response = api_client.post(
        "/api/auth/login",
        json={"email": "user@example.com", "password": "Correct-Horse-Battery-1"},
    )
    assert login_response.status_code == 200

    response = api_client.post(REFRESH_URL)

    assert response.status_code == 200
    assert response.json()["access_token"]


def test_refresh_cookie_is_secure_in_production(
    api_client, create_user, create_session, monkeypatch
):
    refresh_token = create_session(create_user())
    monkeypatch.setattr(settings, "environment", "production")

    response = refresh(api_client, refresh_token)

    assert response_refresh_cookie(response)["secure"] is True


# Session lifetime


def test_refresh_preserves_absolute_session_lifetime(
    api_client, create_user, create_session, db_session
):
    # The server-defined session lifetime (set at login, e.g. by a future "Onthoud mij" choice)
    # is kept: refreshing must not extend it.
    original_expiry = datetime.now(UTC) + timedelta(days=2)
    refresh_token = create_session(create_user(), expires_at=original_expiry)

    response = refresh(api_client, refresh_token)

    assert response.status_code == 200
    cookie = response_refresh_cookie(response)
    rotated = stored_session(db_session, cookie.value)
    assert abs(rotated.expires_at - original_expiry) < timedelta(seconds=1)
    max_age = int(cookie["max-age"])
    assert 2 * 24 * 60 * 60 - 60 <= max_age <= 2 * 24 * 60 * 60


def test_repeated_refresh_never_extends_session(
    api_client, create_user, create_session, db_session
):
    original_expiry = datetime.now(UTC) + timedelta(days=30)
    token = create_session(create_user(), expires_at=original_expiry)

    for _ in range(3):
        token = response_refresh_cookie(refresh(api_client, token)).value

    assert abs(stored_session(db_session, token).expires_at - original_expiry) < timedelta(
        seconds=1
    )


# Unhappy paths


def test_old_refresh_token_cannot_be_reused(api_client, create_user, create_session):
    old_token = create_session(create_user())
    assert refresh(api_client, old_token).status_code == 200

    assert_invalid_refresh(refresh(api_client, old_token))


def test_expired_session_is_rejected(api_client, create_user, create_session, db_session):
    expired_token = create_session(
        create_user(), expires_at=datetime.now(UTC) - timedelta(seconds=1)
    )

    assert_invalid_refresh(refresh(api_client, expired_token))
    assert stored_session(db_session, expired_token) is not None


def test_revoked_session_is_rejected(api_client, create_user, create_session, db_session):
    revoked_token = create_session(create_user(), revoked_at=datetime.now(UTC))

    assert_invalid_refresh(refresh(api_client, revoked_token))
    assert stored_session(db_session, revoked_token) is not None


@pytest.mark.parametrize(
    "refresh_token",
    [None, "", "not-a-valid-refresh-token", "x" * 257],
    ids=["missing", "empty", "unknown", "too-long"],
)
def test_missing_or_invalid_refresh_token_is_rejected(api_client, refresh_token):
    assert_invalid_refresh(refresh(api_client, refresh_token))


def test_inactive_user_cannot_refresh(api_client, create_user, create_session, db_session):
    refresh_token = create_session(create_user(status=UserStatus.INACTIVE))

    assert_invalid_refresh(refresh(api_client, refresh_token))
    assert stored_session(db_session, refresh_token) is not None


def test_refresh_token_only_rotates_its_own_session(
    api_client, create_user, create_session, db_session
):
    user = create_user()
    first_token = create_session(user)
    second_token = create_session(user)

    refresh(api_client, first_token)

    assert stored_session(db_session, first_token) is None
    assert stored_session(db_session, second_token) is not None


def test_internal_error_returns_safe_500_and_keeps_session(
    api_client, create_user, create_session, db_session, monkeypatch
):
    refresh_token = create_session(create_user())

    def fail_access_token(*args, **kwargs):
        raise RuntimeError("token signing failed: internal-detail")

    monkeypatch.setattr(auth_service, "create_access_token", fail_access_token)

    response = refresh(api_client, refresh_token)

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "INTERNAL_SERVER_ERROR"
    assert "internal-detail" not in response.text
    assert "set-cookie" not in response.headers
    # The rotation was rolled back: no new token was issued and the old one is unchanged.
    assert stored_session(db_session, refresh_token) is not None


def test_refresh_is_rate_limited(api_client):
    for _ in range(REFRESH_RATE_LIMIT_ATTEMPTS):
        assert refresh(api_client, "unknown-token").status_code == 401

    response = refresh(api_client, "unknown-token")

    assert response.status_code == 429
    assert response.json()["error"]["code"] == "RATE_LIMIT_EXCEEDED"
    assert 1 <= int(response.headers["Retry-After"]) <= 60


def test_refresh_logging_contains_no_sensitive_data(
    api_client, create_user, create_session, caplog
):
    old_token = create_session(create_user())
    caplog.set_level(logging.INFO)

    success = refresh(api_client, old_token)
    new_token = response_refresh_cookie(success).value
    failure = refresh(api_client, old_token)

    output = "\n".join(JsonFormatter().format(record) for record in caplog.records)
    for sensitive in (
        old_token,
        new_token,
        hash_refresh_token(old_token),
        hash_refresh_token(new_token),
        success.json()["access_token"],
        settings.jwt_secret_key,
        settings.refresh_token_hash_key,
    ):
        assert sensitive not in output

    events = {record.event: record for record in caplog.records if hasattr(record, "event")}
    assert events["REFRESH_SUCCESS"].request_id == success.headers["X-Request-ID"]
    assert events["REFRESH_SUCCESS"].session_id
    assert events["REFRESH_FAILED"].request_id == failure.headers["X-Request-ID"]
    assert events["REFRESH_FAILED"].failure_reason == "INVALID_TOKEN"


# Concurrency (uses committed data and separate database connections)


@pytest.fixture
def committed_session():
    """Creates a committed user and session visible to other connections; cleans up afterwards."""
    user_id = uuid.uuid4()
    refresh_token = generate_refresh_token()

    with SessionLocal() as db:
        db.add(
            User(
                id=user_id,
                first_name="Concurrent",
                last_name="User",
                email=f"concurrent-{user_id}@example.com",
                password_hash=hash_password("Correct-Horse-Battery-1"),
                status=UserStatus.ACTIVE,
            )
        )
        db.flush()
        db.add(
            UserSession(
                id=uuid.uuid4(),
                user_id=user_id,
                token_hash=hash_refresh_token(refresh_token),
                expires_at=datetime.now(UTC) + timedelta(days=30),
            )
        )
        db.commit()

    yield refresh_token

    with SessionLocal() as db:
        db.execute(delete(User).where(User.id == user_id))
        db.commit()


def test_concurrent_refresh_with_same_token_succeeds_only_once(committed_session):
    refresh_token = committed_session
    first = SessionLocal()
    second = SessionLocal()
    outcome: dict[str, object] = {}

    try:
        # The first request rotates the token but has not committed yet (row is locked).
        rotated = rotate_user_session_token(
            first,
            current_token_hash=hash_refresh_token(refresh_token),
            new_token_hash=hash_refresh_token(generate_refresh_token()),
            now=datetime.now(UTC),
        )
        assert rotated is not None

        def second_request():
            try:
                auth_service.refresh_session(second, refresh_token=refresh_token)
                outcome["result"] = "success"
            except InvalidRefreshTokenError:
                outcome["result"] = "rejected"

        thread = threading.Thread(target=second_request)
        thread.start()
        thread.join(timeout=0.5)
        assert thread.is_alive(), "The second refresh should wait for the row lock"

        first.commit()
        thread.join(timeout=5)

        assert outcome["result"] == "rejected"
    finally:
        first.close()
        second.close()


def test_parallel_refresh_requests_with_same_token(committed_session):
    refresh_token = committed_session
    barrier = threading.Barrier(5)
    results: list[str] = []
    lock = threading.Lock()

    def worker():
        with SessionLocal() as db:
            barrier.wait()
            try:
                auth_service.refresh_session(db, refresh_token=refresh_token)
                outcome = "success"
            except InvalidRefreshTokenError:
                outcome = "rejected"
        with lock:
            results.append(outcome)

    threads = [threading.Thread(target=worker) for _ in range(5)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=10)

    assert results.count("success") == 1
    assert results.count("rejected") == 4
