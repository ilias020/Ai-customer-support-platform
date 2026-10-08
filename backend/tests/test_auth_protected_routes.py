import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from fastapi import APIRouter
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.core.config import settings
from app.core.security import (
    ACCESS_TOKEN_TYPE,
    JWT_ALGORITHM,
    create_access_token,
    decode_access_token,
    generate_refresh_token,
)
from app.database.session import get_db
from app.main import create_app
from app.modules.auth import dependencies
from app.modules.auth.dependencies import CurrentUser
from app.modules.users.models import UserStatus

PROTECTED_URL = "/api/test-only/protected"
PASSWORD = "Correct-Horse-Battery-1"


@pytest.fixture
def protected_client(db_session):
    """App instance with a test-only protected route; production routes stay unchanged."""
    application = create_app()
    test_router = APIRouter()

    @test_router.get("/test-only/protected")
    def protected_endpoint(current_user: CurrentUser) -> dict[str, str]:
        return {"user_id": str(current_user.id), "email": current_user.email}

    application.include_router(test_router, prefix="/api")

    def override_get_db():
        yield db_session

    application.dependency_overrides[get_db] = override_get_db
    return TestClient(application, raise_server_exceptions=False)


def access_token_for(user_id: uuid.UUID, issued_at: datetime | None = None) -> str:
    return create_access_token(str(user_id), issued_at=issued_at or datetime.now(UTC))


def signed_token(claims: dict, key: str | None = None, algorithm: str = JWT_ALGORITHM) -> str:
    return jwt.encode(claims, key or settings.jwt_secret_key, algorithm=algorithm)


def valid_claims(user_id: uuid.UUID, **overrides) -> dict:
    now = datetime.now(UTC)
    return {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(minutes=15),
        "token_type": ACCESS_TOKEN_TYPE,
        **overrides,
    }


def get_protected(client: TestClient, authorization: str | None):
    headers = {} if authorization is None else {"Authorization": authorization}
    return client.get(PROTECTED_URL, headers=headers)


def assert_unauthorized(response, code: str = "AUTHENTICATION_REQUIRED"):
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"
    body = response.json()
    assert set(body) == {"error", "request_id"}
    assert set(body["error"]) == {"code", "message"}
    assert body["error"]["code"] == code
    assert body["request_id"] == response.headers["X-Request-ID"]


# Happy path


def test_valid_access_token_grants_access_to_protected_route(protected_client, create_user):
    user = create_user()

    response = get_protected(protected_client, f"Bearer {access_token_for(user.id)}")

    assert response.status_code == 200


def test_authenticated_user_is_derived_from_token(protected_client, create_user):
    create_user(email="other@example.com")
    user = create_user(email="owner@example.com")

    response = get_protected(protected_client, f"Bearer {access_token_for(user.id)}")

    assert response.json() == {"user_id": str(user.id), "email": "owner@example.com"}


def test_bearer_scheme_is_case_insensitive(protected_client, create_user):
    user = create_user()

    response = get_protected(protected_client, f"bearer {access_token_for(user.id)}")

    assert response.status_code == 200


def test_access_token_from_login_grants_access(protected_client, api_client, create_user):
    user = create_user()
    login = api_client.post(
        "/api/auth/login", json={"email": "user@example.com", "password": PASSWORD}
    )

    response = get_protected(protected_client, f"Bearer {login.json()['access_token']}")

    assert response.status_code == 200
    assert response.json()["user_id"] == str(user.id)


# Missing or malformed Authorization header


def test_missing_authorization_header_is_rejected(protected_client):
    assert_unauthorized(get_protected(protected_client, None))


@pytest.mark.parametrize(
    "authorization",
    [
        "",
        "Bearer",
        "Bearer ",
        "Basic dXNlckBleGFtcGxlLmNvbTpwYXNzd29yZA==",
        "Token abc.def.ghi",
        "abc.def.ghi",
    ],
)
def test_malformed_authorization_header_or_wrong_scheme_is_rejected(
    protected_client, create_user, authorization
):
    create_user()

    assert_unauthorized(get_protected(protected_client, authorization))


def test_access_token_with_wrong_scheme_is_rejected(protected_client, create_user):
    user = create_user()

    response = get_protected(protected_client, f"Basic {access_token_for(user.id)}")

    assert_unauthorized(response)


# Invalid tokens


@pytest.mark.parametrize("token", ["not-a-jwt", "a.b.c", "Bearer x"])
def test_invalid_jwt_is_rejected(protected_client, token):
    assert_unauthorized(get_protected(protected_client, f"Bearer {token}"))


def test_token_with_invalid_signature_is_rejected(protected_client, create_user):
    user = create_user()
    token = signed_token(valid_claims(user.id), key="another-signing-key-value-0000000000000")

    assert_unauthorized(get_protected(protected_client, f"Bearer {token}"))


def test_tampered_token_is_rejected(protected_client, create_user):
    victim = create_user(email="victim@example.com")
    attacker = create_user(email="attacker@example.com")
    header, _, signature = access_token_for(attacker.id).split(".")
    forged_payload = signed_token(valid_claims(victim.id), key="irrelevant-key-000000000000000000")
    token = f"{header}.{forged_payload.split('.')[1]}.{signature}"

    assert_unauthorized(get_protected(protected_client, f"Bearer {token}"))


def test_unsigned_token_is_rejected(protected_client, create_user):
    user = create_user()
    token = jwt.encode(valid_claims(user.id), key=None, algorithm="none")

    assert_unauthorized(get_protected(protected_client, f"Bearer {token}"))


@pytest.mark.filterwarnings("ignore::jwt.warnings.InsecureKeyLengthWarning")
def test_token_with_other_algorithm_is_rejected(protected_client, create_user):
    user = create_user()
    token = signed_token(valid_claims(user.id), algorithm="HS512")

    assert_unauthorized(get_protected(protected_client, f"Bearer {token}"))


def test_expired_access_token_is_rejected(protected_client, create_user):
    user = create_user()
    issued_at = datetime.now(UTC) - timedelta(minutes=settings.access_token_expire_minutes + 1)

    response = get_protected(protected_client, f"Bearer {access_token_for(user.id, issued_at)}")

    assert_unauthorized(response, code="ACCESS_TOKEN_EXPIRED")


def test_expired_token_with_invalid_signature_is_not_reported_as_expired(
    protected_client, create_user
):
    user = create_user()
    past = datetime.now(UTC) - timedelta(hours=1)
    claims = valid_claims(user.id, iat=past, exp=past + timedelta(minutes=15))
    token = signed_token(claims, key="another-signing-key-value-0000000000000")

    assert_unauthorized(get_protected(protected_client, f"Bearer {token}"))


@pytest.mark.parametrize("missing_claim", ["sub", "iat", "exp", "token_type"])
def test_token_missing_required_claim_is_rejected(protected_client, create_user, missing_claim):
    user = create_user()
    claims = valid_claims(user.id)
    del claims[missing_claim]

    assert_unauthorized(get_protected(protected_client, f"Bearer {signed_token(claims)}"))


@pytest.mark.parametrize("subject", ["not-a-uuid", "", "1"])
def test_token_with_invalid_subject_is_rejected(protected_client, subject):
    token = signed_token({**valid_claims(uuid.uuid4()), "sub": subject})

    assert_unauthorized(get_protected(protected_client, f"Bearer {token}"))


# Refresh tokens are not access tokens


def test_opaque_refresh_token_is_not_accepted_as_access_token(
    protected_client, api_client, create_user
):
    create_user()
    login = api_client.post(
        "/api/auth/login", json={"email": "user@example.com", "password": PASSWORD}
    )
    refresh_token = login.cookies["nimbus_refresh_token"]

    assert_unauthorized(get_protected(protected_client, f"Bearer {refresh_token}"))
    assert_unauthorized(get_protected(protected_client, f"Bearer {generate_refresh_token()}"))


@pytest.mark.parametrize("token_type", ["refresh", "ACCESS", "", None])
def test_signed_jwt_with_other_token_type_is_rejected(protected_client, create_user, token_type):
    user = create_user()
    token = signed_token(valid_claims(user.id, token_type=token_type))

    assert_unauthorized(get_protected(protected_client, f"Bearer {token}"))


# User status


def test_deactivated_user_is_rejected_with_still_valid_token(
    protected_client, db_session, create_user
):
    user = create_user()
    token = access_token_for(user.id)
    user.status = UserStatus.INACTIVE
    db_session.commit()

    assert_unauthorized(get_protected(protected_client, f"Bearer {token}"))


def test_inactive_user_is_rejected(protected_client, create_user):
    user = create_user(status=UserStatus.INACTIVE)

    assert_unauthorized(get_protected(protected_client, f"Bearer {access_token_for(user.id)}"))


def test_deleted_user_is_rejected(protected_client, db_session, create_user):
    user = create_user()
    token = access_token_for(user.id)
    db_session.delete(user)
    db_session.commit()

    assert_unauthorized(get_protected(protected_client, f"Bearer {token}"))


def test_unknown_user_is_rejected(protected_client):
    token = access_token_for(uuid.uuid4())

    assert_unauthorized(get_protected(protected_client, f"Bearer {token}"))


# Client-supplied identity is ignored


def test_client_supplied_identity_is_ignored(protected_client, create_user):
    user = create_user(email="owner@example.com")
    other = create_user(email="other@example.com")

    response = protected_client.get(
        PROTECTED_URL,
        params={"user_id": str(other.id)},
        headers={
            "Authorization": f"Bearer {access_token_for(user.id)}",
            "X-User-ID": str(other.id),
        },
    )

    assert response.json()["user_id"] == str(user.id)


def test_client_supplied_identity_without_token_is_rejected(protected_client, create_user):
    user = create_user()

    response = protected_client.get(
        PROTECTED_URL, params={"user_id": str(user.id)}, headers={"X-User-ID": str(user.id)}
    )

    assert_unauthorized(response)


# Error responses do not leak details


def test_error_response_does_not_leak_token_or_claims(protected_client, create_user):
    user = create_user()
    issued_at = datetime.now(UTC) - timedelta(hours=1)
    token = access_token_for(user.id, issued_at)

    response = get_protected(protected_client, f"Bearer {token}")

    assert token not in response.text
    assert str(user.id) not in response.text
    assert settings.jwt_secret_key not in response.text
    assert "Signature" not in response.text


def test_unexpected_error_returns_safe_500(protected_client, create_user, monkeypatch):
    user = create_user()

    def failing_lookup(db, user_id):
        raise OperationalError("SELECT secret_internal_query", {}, Exception("db-host:5432"))

    monkeypatch.setattr(dependencies, "get_user_by_id", failing_lookup)

    response = get_protected(protected_client, f"Bearer {access_token_for(user.id)}")

    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "INTERNAL_SERVER_ERROR", "message": "An unexpected error occurred."},
        "request_id": response.headers["X-Request-ID"],
    }
    assert "secret_internal_query" not in response.text
    assert "db-host" not in response.text


# Public endpoints remain public


def test_health_is_public(api_client):
    response = api_client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_login_and_refresh_are_public(api_client, create_user):
    create_user()

    login = api_client.post(
        "/api/auth/login", json={"email": "user@example.com", "password": PASSWORD}
    )
    refresh = api_client.post("/api/auth/refresh")

    assert login.status_code == 200
    assert refresh.status_code == 200
    assert "authorization" not in {name.lower() for name in login.request.headers}
    assert "authorization" not in {name.lower() for name in refresh.request.headers}


def test_public_endpoints_do_not_require_current_user():
    application = create_app()

    for route in application.routes:
        path = getattr(route, "path", "")
        if path in {"/api/health", "/api/auth/login", "/api/auth/refresh"}:
            dependency_calls = {dep.call for dep in route.dependant.dependencies}
            assert dependencies.get_current_user not in dependency_calls


# Token decoding unit tests


def test_decode_access_token_returns_user_id():
    user_id = uuid.uuid4()

    assert decode_access_token(access_token_for(user_id)) == user_id
