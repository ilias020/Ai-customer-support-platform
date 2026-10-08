import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.exc import OperationalError

from app.core.config import settings
from app.core.security import create_access_token, hash_refresh_token
from app.modules.auth import dependencies
from app.modules.auth.models import UserSession
from app.modules.users.models import UserStatus

ME_URL = "/api/users/me"
PASSWORD = "Correct-Horse-Battery-1"
CONTRACT_FIELDS = {
    "id",
    "email",
    "first_name",
    "last_name",
    "status",
    "language",
    "timezone",
    "last_login_at",
    "created_at",
}


def bearer(user_id: uuid.UUID, issued_at: datetime | None = None) -> dict[str, str]:
    token = create_access_token(str(user_id), issued_at=issued_at or datetime.now(UTC))
    return {"Authorization": f"Bearer {token}"}


def assert_unauthorized(response, code: str = "AUTHENTICATION_REQUIRED"):
    assert response.status_code == 401
    body = response.json()
    assert set(body) == {"error", "request_id"}
    assert body["error"]["code"] == code
    assert body["request_id"] == response.headers["X-Request-ID"]


# 1. Happy path


def test_returns_current_user_with_exact_contract(api_client, create_user):
    user = create_user(email="john@example.com")

    response = api_client.get(ME_URL, headers=bearer(user.id))

    assert response.status_code == 200
    body = response.json()
    assert set(body) == CONTRACT_FIELDS
    assert "data" not in body
    assert body["id"] == str(user.id)
    assert body["email"] == "john@example.com"
    assert body["first_name"] == "Test"
    assert body["last_name"] == "User"
    assert body["status"] == "ACTIVE"
    assert body["language"] == "en"
    assert body["timezone"] == "UTC"
    assert body["last_login_at"] is None
    assert body["created_at"].endswith("Z")


def test_returns_current_database_values(api_client, db_session, create_user):
    user = create_user()
    headers = bearer(user.id)
    user.first_name = "Updated"
    user.language = "nl"
    user.timezone = "Europe/Amsterdam"
    db_session.commit()

    body = api_client.get(ME_URL, headers=headers).json()

    assert body["first_name"] == "Updated"
    assert body["language"] == "nl"
    assert body["timezone"] == "Europe/Amsterdam"


def test_access_token_from_login_returns_user_with_last_login(api_client, create_user):
    user = create_user()
    login = api_client.post(
        "/api/auth/login", json={"email": "user@example.com", "password": PASSWORD}
    )

    response = api_client.get(
        ME_URL, headers={"Authorization": f"Bearer {login.json()['access_token']}"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(user.id)
    assert body["last_login_at"] is not None
    assert body["last_login_at"].endswith("Z")


# 2-4. Missing, invalid and expired authentication


def test_missing_authentication_is_rejected(api_client):
    assert_unauthorized(api_client.get(ME_URL))


@pytest.mark.parametrize(
    "authorization", ["Bearer not-a-jwt", "Bearer a.b.c", "Basic dXNlcjpwYXNz", "Bearer"]
)
def test_invalid_access_token_is_rejected(api_client, create_user, authorization):
    create_user()

    assert_unauthorized(api_client.get(ME_URL, headers={"Authorization": authorization}))


def test_expired_access_token_is_rejected(api_client, create_user):
    user = create_user()
    issued_at = datetime.now(UTC) - timedelta(minutes=settings.access_token_expire_minutes + 1)

    response = api_client.get(ME_URL, headers=bearer(user.id, issued_at))

    assert_unauthorized(response, code="ACCESS_TOKEN_EXPIRED")


def test_refresh_token_is_not_accepted(api_client, create_user):
    create_user()
    login = api_client.post(
        "/api/auth/login", json={"email": "user@example.com", "password": PASSWORD}
    )
    refresh_token = login.cookies["nimbus_refresh_token"]
    api_client.cookies.clear()

    assert_unauthorized(
        api_client.get(ME_URL, headers={"Authorization": f"Bearer {refresh_token}"})
    )


# 5. No sensitive fields


def test_response_contains_no_sensitive_data(api_client, db_session, create_user):
    user = create_user()
    refresh_token = "refresh-token-value-that-must-never-leak-0000"
    db_session.add(
        UserSession(
            id=uuid.uuid4(),
            user_id=user.id,
            token_hash=hash_refresh_token(refresh_token),
            expires_at=datetime.now(UTC) + timedelta(days=1),
        )
    )
    db_session.commit()
    headers = bearer(user.id)

    response = api_client.get(ME_URL, headers=headers)

    text = response.text
    for forbidden in (
        "password",
        "hash",
        "token",
        "session",
        "updated_at",
        user.password_hash,
        hash_refresh_token(refresh_token),
        refresh_token,
        headers["Authorization"].removeprefix("Bearer "),
    ):
        assert forbidden not in text
    assert "set-cookie" not in response.headers


# 6. Client-supplied identity is ignored


def test_client_supplied_user_id_cannot_select_other_user(api_client, create_user):
    owner = create_user(email="owner@example.com")
    other = create_user(email="other@example.com")

    response = api_client.get(
        ME_URL,
        params={"user_id": str(other.id), "id": str(other.id)},
        headers={**bearer(owner.id), "X-User-ID": str(other.id)},
    )

    assert response.status_code == 200
    assert response.json()["id"] == str(owner.id)
    assert response.json()["email"] == "owner@example.com"


def test_user_id_path_segment_does_not_expose_other_user(api_client, create_user):
    owner = create_user(email="owner@example.com")
    other = create_user(email="other@example.com")

    response = api_client.get(f"/api/users/{other.id}", headers=bearer(owner.id))

    assert response.status_code in {404, 405}
    assert "other@example.com" not in response.text


# 7. Deleted or unknown user


def test_deleted_user_is_rejected(api_client, db_session, create_user):
    user = create_user()
    headers = bearer(user.id)
    db_session.delete(user)
    db_session.commit()

    response = api_client.get(ME_URL, headers=headers)

    assert_unauthorized(response)
    assert str(user.id) not in response.text


def test_unknown_user_is_rejected(api_client):
    assert_unauthorized(api_client.get(ME_URL, headers=bearer(uuid.uuid4())))


# 8. Inactive user


def test_inactive_user_is_rejected(api_client, create_user):
    user = create_user(status=UserStatus.INACTIVE)

    response = api_client.get(ME_URL, headers=bearer(user.id))

    assert_unauthorized(response)
    assert "user@example.com" not in response.text


def test_user_deactivated_after_token_issuance_is_rejected(api_client, db_session, create_user):
    user = create_user()
    headers = bearer(user.id)
    user.status = UserStatus.INACTIVE
    db_session.commit()

    assert_unauthorized(api_client.get(ME_URL, headers=headers))


# 9. Unexpected internal error


def test_unexpected_error_returns_safe_500(api_client, create_user, monkeypatch):
    user = create_user()

    def failing_lookup(db, user_id):
        raise OperationalError("SELECT secret_internal_query", {}, Exception("db-host:5432"))

    monkeypatch.setattr(dependencies, "get_user_by_id", failing_lookup)

    response = api_client.get(ME_URL, headers=bearer(user.id))

    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "INTERNAL_SERVER_ERROR", "message": "An unexpected error occurred."},
        "request_id": response.headers["X-Request-ID"],
    }
    assert "secret_internal_query" not in response.text
    assert "db-host" not in response.text


# Route registration


def test_only_get_me_is_registered_and_no_auth_me():
    from app.main import create_app

    paths = create_app().openapi()["paths"]

    assert set(paths["/api/users/me"]) == {"get"}
    assert paths["/api/users/me"]["get"]["security"] == [{"HTTPBearer": []}]
    assert "/api/auth/me" not in paths
