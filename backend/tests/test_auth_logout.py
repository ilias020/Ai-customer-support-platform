import logging
import threading
import uuid
from datetime import UTC, datetime, timedelta
from http.cookies import SimpleCookie

import pytest
from sqlalchemy import delete, select

from app.core.config import settings
from app.core.logging import JsonFormatter
from app.core.security import generate_refresh_token, hash_password, hash_refresh_token
from app.database.session import SessionLocal
from app.modules.auth import service as auth_service
from app.modules.auth.exceptions import InvalidRefreshTokenError
from app.modules.auth.models import UserSession
from app.modules.auth.repository import revoke_user_session, rotate_user_session_token
from app.modules.auth.router import REFRESH_TOKEN_COOKIE_NAME
from app.modules.users.models import User, UserStatus

LOGOUT_URL = "/api/auth/logout"
REFRESH_URL = "/api/auth/refresh"
PASSWORD = "Correct-Horse-Battery-1"


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


def post_with_cookie(api_client, url: str, refresh_token: str | None, **kwargs):
    api_client.cookies.clear()
    if refresh_token is not None:
        api_client.cookies.set(REFRESH_TOKEN_COOKIE_NAME, refresh_token)
    return api_client.post(url, **kwargs)


def logout(api_client, refresh_token: str | None, **kwargs):
    return post_with_cookie(api_client, LOGOUT_URL, refresh_token, **kwargs)


def refresh(api_client, refresh_token: str | None):
    return post_with_cookie(api_client, REFRESH_URL, refresh_token)


def stored_session(db_session, refresh_token: str) -> UserSession | None:
    db_session.expire_all()
    return db_session.scalar(
        select(UserSession).where(UserSession.token_hash == hash_refresh_token(refresh_token))
    )


def response_cookie(response):
    cookie = SimpleCookie()
    cookie.load(response.headers["set-cookie"])
    return cookie[REFRESH_TOKEN_COOKIE_NAME]


def assert_refresh_cookie_cleared(response):
    assert len(response.headers.get_list("set-cookie")) == 1
    cookie = response_cookie(response)
    assert cookie.value == ""
    assert cookie["max-age"] == "0"
    assert cookie["path"] == "/api/auth"
    assert cookie["httponly"] is True
    assert cookie["samesite"].lower() == "lax"
    assert cookie["domain"] == ""


def assert_invalid_session(response):
    assert response.status_code == 401
    body = response.json()
    assert body["error"]["code"] == "INVALID_REFRESH_TOKEN"
    assert body["request_id"] == response.headers["X-Request-ID"]
    assert_refresh_cookie_cleared(response)


# 1. Successful logout


def test_logout_returns_204_without_body(api_client, create_user, create_session):
    refresh_token = create_session(create_user())

    response = logout(api_client, refresh_token)

    assert response.status_code == 204
    assert response.content == b""
    assert "content-type" not in response.headers
    assert response.headers["X-Request-ID"]


def test_logout_clears_the_httponly_refresh_cookie(api_client, create_user, create_session):
    response = logout(api_client, create_session(create_user()))

    assert response.status_code == 204
    assert_refresh_cookie_cleared(response)
    assert "secure" not in response.headers["set-cookie"].lower()


def test_logout_cookie_removal_is_secure_in_production(
    api_client, create_user, create_session, monkeypatch
):
    refresh_token = create_session(create_user())
    monkeypatch.setattr(settings, "environment", "production")

    response = logout(api_client, refresh_token)

    assert response.status_code == 204
    assert response_cookie(response)["secure"] is True


def test_logout_works_with_cookie_from_login(api_client, create_user, db_session):
    create_user(email="john@example.com", password=PASSWORD)
    api_client.cookies.clear()
    login = api_client.post(
        "/api/auth/login", json={"email": "john@example.com", "password": PASSWORD}
    )
    refresh_token = response_cookie(login).value

    response = logout(api_client, refresh_token)

    assert response.status_code == 204
    assert stored_session(db_session, refresh_token).revoked_at is not None


def test_logout_works_with_cookie_from_registration(api_client, db_session):
    api_client.cookies.clear()
    registration = api_client.post(
        "/api/auth/register",
        json={
            "first_name": "John",
            "last_name": "Doe",
            "email": "john@example.com",
            "password": PASSWORD,
            "workspace_name": "Example Company",
        },
    )
    refresh_token = response_cookie(registration).value

    response = logout(api_client, refresh_token)

    assert response.status_code == 204
    assert stored_session(db_session, refresh_token).revoked_at is not None


# 2. Refresh token is invalidated


def test_logout_revokes_the_session(api_client, create_user, create_session, db_session):
    refresh_token = create_session(create_user())
    before = datetime.now(UTC)

    logout(api_client, refresh_token)

    session = stored_session(db_session, refresh_token)
    assert session is not None, "The session is kept for history and only marked as revoked"
    assert session.revoked_at is not None
    assert before - timedelta(seconds=5) <= session.revoked_at <= datetime.now(UTC)
    assert session.token_hash == hash_refresh_token(refresh_token)


# 3. A revoked session cannot be used again


def test_revoked_session_cannot_be_logged_out_again(
    api_client, create_user, create_session, db_session
):
    refresh_token = create_session(create_user())
    logout(api_client, refresh_token)
    revoked_at = stored_session(db_session, refresh_token).revoked_at

    response = logout(api_client, refresh_token)

    assert_invalid_session(response)
    assert stored_session(db_session, refresh_token).revoked_at == revoked_at


# 4. Refresh after logout is blocked


def test_refresh_after_logout_is_rejected(api_client, create_user, create_session):
    refresh_token = create_session(create_user())
    logout(api_client, refresh_token)

    response = refresh(api_client, refresh_token)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_REFRESH_TOKEN"
    assert "access_token" not in response.text


# 5. Other sessions stay active


def test_logout_keeps_other_sessions_of_the_same_user(
    api_client, create_user, create_session, db_session
):
    user = create_user()
    current_token = create_session(user)
    other_token = create_session(user)

    logout(api_client, current_token)

    assert stored_session(db_session, current_token).revoked_at is not None
    assert stored_session(db_session, other_token).revoked_at is None
    assert refresh(api_client, other_token).status_code == 200


def test_logout_does_not_affect_sessions_of_other_users(
    api_client, create_user, create_session, db_session
):
    current_token = create_session(create_user(email="john@example.com"))
    other_user_token = create_session(create_user(email="jane@example.com"))

    logout(api_client, current_token)

    assert stored_session(db_session, other_user_token).revoked_at is None


# 6. Logout without valid authentication


@pytest.mark.parametrize(
    "refresh_token",
    [None, "", "unknown-token", "x" * 257],
    ids=["missing", "empty", "unknown", "too-long"],
)
def test_logout_without_valid_session_is_rejected(
    api_client, create_user, create_session, db_session, refresh_token
):
    existing_token = create_session(create_user())

    response = logout(api_client, refresh_token)

    assert_invalid_session(response)
    assert stored_session(db_session, existing_token).revoked_at is None


def test_access_token_without_refresh_cookie_cannot_log_out(
    api_client, create_user, create_session, db_session
):
    create_user(email="john@example.com", password=PASSWORD)
    api_client.cookies.clear()
    login = api_client.post(
        "/api/auth/login", json={"email": "john@example.com", "password": PASSWORD}
    )
    refresh_token = response_cookie(login).value

    response = logout(
        api_client,
        None,
        headers={"Authorization": f"Bearer {login.json()['access_token']}"},
    )

    assert_invalid_session(response)
    assert stored_session(db_session, refresh_token).revoked_at is None


# 7. An already ended session is handled safely


def test_already_revoked_session_is_rejected_without_changes(
    api_client, create_user, create_session, db_session
):
    revoked_at = datetime.now(UTC) - timedelta(days=1)
    refresh_token = create_session(create_user(), revoked_at=revoked_at)

    response = logout(api_client, refresh_token)

    assert_invalid_session(response)
    assert stored_session(db_session, refresh_token).revoked_at == revoked_at


def test_expired_session_is_rejected_without_changes(
    api_client, create_user, create_session, db_session
):
    refresh_token = create_session(
        create_user(), expires_at=datetime.now(UTC) - timedelta(seconds=1)
    )

    response = logout(api_client, refresh_token)

    assert_invalid_session(response)
    assert stored_session(db_session, refresh_token).revoked_at is None


# 8. Internal errors


def test_internal_error_returns_safe_500_and_keeps_session(
    api_client, create_user, create_session, db_session, monkeypatch
):
    refresh_token = create_session(create_user())

    def fail_revocation(*args, **kwargs):
        raise RuntimeError("database unavailable: internal-detail")

    monkeypatch.setattr(auth_service, "revoke_user_session", fail_revocation)

    response = logout(api_client, refresh_token)

    assert response.status_code == 500
    body = response.json()
    assert body["error"]["code"] == "INTERNAL_SERVER_ERROR"
    assert "internal-detail" not in response.text
    assert refresh_token not in response.text
    # No (partial) logout is confirmed: the cookie is kept and the session is still active.
    assert "set-cookie" not in response.headers
    assert stored_session(db_session, refresh_token).revoked_at is None


def test_failed_commit_rolls_back_the_revocation(
    api_client, create_user, create_session, db_session, monkeypatch
):
    refresh_token = create_session(create_user())

    def fail_commit():
        raise RuntimeError("commit failed")

    # The UPDATE has already been executed when the commit fails.
    monkeypatch.setattr(db_session, "commit", fail_commit)

    response = logout(api_client, refresh_token)
    monkeypatch.undo()

    assert response.status_code == 500
    assert "set-cookie" not in response.headers
    assert stored_session(db_session, refresh_token).revoked_at is None
    assert refresh(api_client, refresh_token).status_code == 200


# Logging


def test_logout_logging_contains_no_sensitive_data(api_client, create_user, create_session, caplog):
    user = create_user()
    refresh_token = create_session(user)
    caplog.set_level(logging.INFO)

    success = logout(api_client, refresh_token)
    failure = logout(api_client, refresh_token)

    output = "\n".join(JsonFormatter().format(record) for record in caplog.records)
    for sensitive in (
        refresh_token,
        hash_refresh_token(refresh_token),
        settings.jwt_secret_key,
        settings.refresh_token_hash_key,
    ):
        assert sensitive not in output
    assert refresh_token not in failure.text

    events = {record.event: record for record in caplog.records if hasattr(record, "event")}
    revoked = events["SESSION_REVOKED"]
    assert revoked.reason == "LOGOUT"
    assert revoked.user_id == str(user.id)
    assert revoked.session_id
    assert revoked.request_id == success.headers["X-Request-ID"]
    assert events["LOGOUT_FAILED"].failure_reason == "INVALID_TOKEN"
    assert events["LOGOUT_FAILED"].request_id == failure.headers["X-Request-ID"]


# CORS (Security Design §6.1/§6.2: SameSite cookie + strict CORS allowlist)


def test_logout_preflight_is_only_allowed_for_configured_origins(api_client, monkeypatch):
    monkeypatch.setattr(settings, "cors_allowed_origins", ["http://localhost:3000"])
    from fastapi.testclient import TestClient

    from app.main import create_app

    client = TestClient(create_app())

    def preflight(origin: str):
        return client.options(
            LOGOUT_URL,
            headers={"Origin": origin, "Access-Control-Request-Method": "POST"},
        )

    allowed = preflight("http://localhost:3000")
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert allowed.headers["access-control-allow-credentials"] == "true"

    rejected = preflight("https://evil.example")
    assert "access-control-allow-origin" not in rejected.headers


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
                password_hash=hash_password(PASSWORD),
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


def session_by_token(refresh_token: str) -> UserSession | None:
    with SessionLocal() as db:
        return db.scalar(
            select(UserSession).where(UserSession.token_hash == hash_refresh_token(refresh_token))
        )


def run_while_row_is_locked(first, action):
    """Runs `action` in a second connection while `first` holds the session row lock."""
    outcome: dict[str, object] = {}

    def second_request():
        with SessionLocal() as second:
            try:
                action(second)
                outcome["result"] = "success"
            except InvalidRefreshTokenError:
                outcome["result"] = "rejected"

    thread = threading.Thread(target=second_request)
    thread.start()
    thread.join(timeout=0.5)
    assert thread.is_alive(), "The second request should wait for the row lock"

    first.commit()
    thread.join(timeout=5)
    return outcome["result"]


def test_refresh_waiting_for_a_logout_is_rejected(committed_session):
    refresh_token = committed_session

    with SessionLocal() as first:
        # The logout has revoked the session but not committed yet (row is locked).
        revoked = revoke_user_session(
            first, token_hash=hash_refresh_token(refresh_token), now=datetime.now(UTC)
        )
        assert revoked is not None

        result = run_while_row_is_locked(
            first, lambda db: auth_service.refresh_session(db, refresh_token=refresh_token)
        )

    assert result == "rejected"
    session = session_by_token(refresh_token)
    assert session.revoked_at is not None
    assert session.token_hash == hash_refresh_token(refresh_token), "No new token was issued"


def test_logout_waiting_for_a_refresh_does_not_use_the_rotated_token(committed_session):
    refresh_token = committed_session
    new_token = generate_refresh_token()

    with SessionLocal() as first:
        rotated = rotate_user_session_token(
            first,
            current_token_hash=hash_refresh_token(refresh_token),
            new_token_hash=hash_refresh_token(new_token),
            now=datetime.now(UTC),
        )
        assert rotated is not None

        result = run_while_row_is_locked(
            first, lambda db: auth_service.logout(db, refresh_token=refresh_token)
        )

    # The old token no longer identifies a session; only the client holding the new token
    # (from the refresh response) can end it.
    assert result == "rejected"
    assert session_by_token(new_token).revoked_at is None


def test_parallel_logouts_with_same_token_revoke_once(committed_session):
    refresh_token = committed_session
    barrier = threading.Barrier(5)
    results: list[str] = []
    lock = threading.Lock()

    def worker():
        with SessionLocal() as db:
            barrier.wait()
            try:
                auth_service.logout(db, refresh_token=refresh_token)
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
    assert session_by_token(refresh_token).revoked_at is not None
