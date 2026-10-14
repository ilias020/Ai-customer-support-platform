import json
import logging
import threading
import unicodedata
import uuid
from datetime import UTC, datetime, timedelta
from http.cookies import SimpleCookie

import jwt
import pytest
from sqlalchemy import delete, func, select

from app.core.config import settings
from app.core.logging import JsonFormatter
from app.core.security import hash_refresh_token, verify_password
from app.database.session import SessionLocal
from app.modules.auth import service as auth_service
from app.modules.auth.exceptions import EmailAlreadyExistsError
from app.modules.auth.models import UserSession
from app.modules.auth.router import REFRESH_TOKEN_COOKIE_NAME, REGISTER_RATE_LIMIT_ATTEMPTS
from app.modules.users.models import User
from app.modules.workspaces.models import Workspace, WorkspaceMembership
from app.modules.workspaces.repository import slugify_workspace_name

REGISTER_URL = "/api/auth/register"
PASSWORD = "Correct-Horse-Battery-1"


def payload(**overrides) -> dict:
    return {
        "first_name": "John",
        "last_name": "Doe",
        "email": "john@example.com",
        "password": PASSWORD,
        "workspace_name": "Example Company",
        **overrides,
    }


def register(api_client, **overrides):
    api_client.cookies.clear()
    return api_client.post(REGISTER_URL, json=payload(**overrides))


def response_cookie(response):
    cookie = SimpleCookie()
    cookie.load(response.headers["set-cookie"])
    return cookie[REFRESH_TOKEN_COOKIE_NAME]


def count(db_session, model, *conditions) -> int:
    db_session.expire_all()
    return db_session.scalar(select(func.count()).select_from(model).where(*conditions))


def user_by_email(db_session, email: str) -> User | None:
    db_session.expire_all()
    return db_session.scalar(select(User).where(User.email == email))


def assert_error(response, status_code: int, code: str):
    assert response.status_code == status_code
    body = response.json()
    assert body["error"]["code"] == code
    assert body["request_id"] == response.headers["X-Request-ID"]
    assert "set-cookie" not in response.headers
    assert "access_token" not in body


def assert_nothing_created(db_session, email: str = "john@example.com"):
    assert count(db_session, User, User.email == email) == 0
    assert count(db_session, Workspace, Workspace.name == "Example Company") == 0
    assert count(db_session, WorkspaceMembership) == 0
    assert count(db_session, UserSession) == 0


# Happy path


def test_register_returns_201_with_token_response(api_client):
    response = register(api_client)

    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"access_token", "token_type", "expires_in"}
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == settings.access_token_expire_minutes * 60


def test_register_creates_active_user_with_hashed_password(api_client, db_session):
    register(api_client)

    user = user_by_email(db_session, "john@example.com")
    assert user is not None
    assert user.status == "ACTIVE"
    assert user.first_name == "John"
    assert user.last_name == "Doe"
    assert user.password_hash.startswith("$argon2id$")
    assert user.password_hash != PASSWORD
    assert verify_password(PASSWORD, user.password_hash)
    assert user.last_login_at is not None


def test_register_creates_workspace_and_admin_membership(api_client, db_session):
    register(api_client)

    user = user_by_email(db_session, "john@example.com")
    workspace = db_session.scalar(select(Workspace).where(Workspace.name == "Example Company"))
    membership = db_session.scalar(
        select(WorkspaceMembership).where(WorkspaceMembership.user_id == user.id)
    )
    assert workspace.slug == "example-company"
    assert workspace.status == "ACTIVE"
    assert membership.workspace_id == workspace.id
    assert membership.role == "ADMIN"
    assert membership.status == "ACTIVE"
    assert membership.joined_at is not None


def test_register_creates_session_and_sets_http_only_refresh_cookie(api_client, db_session):
    before = datetime.now(UTC)
    response = register(api_client)

    cookie = response_cookie(response)
    assert cookie["httponly"]
    assert cookie["path"] == "/api/auth"
    assert cookie["samesite"].lower() == "lax"
    assert int(cookie["max-age"]) == settings.refresh_token_expire_days * 24 * 60 * 60
    assert "domain" not in cookie or not cookie["domain"]

    user = user_by_email(db_session, "john@example.com")
    sessions = db_session.scalars(select(UserSession).where(UserSession.user_id == user.id)).all()
    assert len(sessions) == 1
    session = sessions[0]
    # Only the HMAC hash of the refresh token is stored.
    assert session.token_hash == hash_refresh_token(cookie.value)
    assert cookie.value not in session.token_hash
    assert session.revoked_at is None
    expected_expiry = before + timedelta(days=settings.refresh_token_expire_days)
    assert abs(session.expires_at - expected_expiry) < timedelta(minutes=1)


def test_access_token_identifies_the_new_user(api_client, db_session):
    response = register(api_client)

    claims = jwt.decode(
        response.json()["access_token"], settings.jwt_secret_key, algorithms=["HS256"]
    )
    user = user_by_email(db_session, "john@example.com")
    assert claims["sub"] == str(user.id)
    assert claims["token_type"] == "access"


# Compatibility with login, refresh and current user


def test_registered_session_works_with_users_me_and_refresh(api_client):
    response = register(api_client)
    access_token = response.json()["access_token"]
    refresh_cookie = response_cookie(response).value

    me = api_client.get("/api/users/me", headers={"Authorization": f"Bearer {access_token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "john@example.com"
    assert me.json()["first_name"] == "John"

    api_client.cookies.clear()
    api_client.cookies.set(REFRESH_TOKEN_COOKIE_NAME, refresh_cookie)
    refreshed = api_client.post("/api/auth/refresh")
    assert refreshed.status_code == 200


def test_registered_user_can_log_in_with_same_password(api_client):
    register(api_client)
    api_client.cookies.clear()

    login = api_client.post(
        "/api/auth/login", json={"email": "JOHN@example.com", "password": PASSWORD}
    )

    assert login.status_code == 200


def test_unicode_password_is_stored_exactly_and_not_normalized(api_client):
    password = unicodedata.normalize("NFC", "Wachtwoörd-2026 é")
    register(api_client, password=password)
    api_client.cookies.clear()

    exact = api_client.post(
        "/api/auth/login", json={"email": "john@example.com", "password": password}
    )
    decomposed = api_client.post(
        "/api/auth/login",
        json={"email": "john@example.com", "password": unicodedata.normalize("NFD", password)},
    )

    assert exact.status_code == 200
    assert decomposed.status_code == 401


# E-mail normalization and duplicates


def test_email_is_trimmed_and_lowercased(api_client, db_session):
    register(api_client, email="  John.Doe@Example.COM \t")

    assert user_by_email(db_session, "john.doe@example.com") is not None


@pytest.mark.parametrize("email", ["john@example.com", "JOHN@EXAMPLE.COM", "  John@Example.com "])
def test_existing_email_is_rejected_case_insensitively(api_client, db_session, email):
    assert register(api_client).status_code == 201

    response = register(api_client, email=email, workspace_name="Second Company")

    assert_error(response, 409, "EMAIL_ALREADY_EXISTS")
    assert count(db_session, User) == 1
    assert count(db_session, Workspace, Workspace.name == "Second Company") == 0
    assert count(db_session, UserSession) == 1


def test_duplicate_detected_by_database_constraint_when_precheck_misses(
    api_client, db_session, monkeypatch
):
    # Simulates a concurrent registration that committed after the pre-check.
    assert register(api_client).status_code == 201
    monkeypatch.setattr(auth_service, "get_user_by_email", lambda db, email: None)

    response = register(api_client, workspace_name="Second Company")

    assert_error(response, 409, "EMAIL_ALREADY_EXISTS")
    assert count(db_session, User) == 1
    assert count(db_session, Workspace, Workspace.name == "Second Company") == 0
    assert count(db_session, WorkspaceMembership) == 1


@pytest.fixture
def cleanup_registered_users():
    emails: list[str] = []
    yield emails
    with SessionLocal() as db:
        user_ids = db.scalars(select(User.id).where(User.email.in_(emails))).all()
        workspace_ids = db.scalars(
            select(WorkspaceMembership.workspace_id).where(
                WorkspaceMembership.user_id.in_(user_ids)
            )
        ).all()
        db.execute(delete(Workspace).where(Workspace.id.in_(workspace_ids)))
        db.execute(delete(User).where(User.id.in_(user_ids)))
        db.commit()


def test_concurrent_registrations_with_same_email_create_one_account(cleanup_registered_users):
    email = f"race-{uuid.uuid4().hex}@example.com"
    cleanup_registered_users.append(email)
    attempts = 5
    barrier = threading.Barrier(attempts)
    outcomes: list[str] = []
    lock = threading.Lock()

    def worker(index: int):
        with SessionLocal() as db:
            barrier.wait()
            try:
                auth_service.register(
                    db,
                    first_name="Race",
                    last_name=str(index),
                    email=email,
                    password=PASSWORD,
                    workspace_name=f"Race Workspace {index}",
                )
                outcome = "created"
            except EmailAlreadyExistsError:
                outcome = "conflict"
        with lock:
            outcomes.append(outcome)

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(attempts)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)

    assert sorted(outcomes) == ["conflict"] * (attempts - 1) + ["created"]
    with SessionLocal() as db:
        user_ids = db.scalars(select(User.id).where(User.email == email)).all()
        assert len(user_ids) == 1
        memberships = db.scalars(
            select(WorkspaceMembership).where(WorkspaceMembership.user_id == user_ids[0])
        ).all()
        assert len(memberships) == 1
        orphan_workspaces = db.scalar(
            select(func.count())
            .select_from(Workspace)
            .where(Workspace.name.like("Race Workspace %"))
            .where(~Workspace.id.in_(select(WorkspaceMembership.workspace_id)))
        )
        assert orphan_workspaces == 0


# Workspace slug


@pytest.mark.parametrize(
    ("name", "slug"),
    [
        ("Example Company", "example-company"),
        ("  Café Zürich & Co.  ", "cafe-zurich-co"),
        ("ACME---Support", "acme-support"),
        ("!!!", "workspace"),
        ("日本語", "workspace"),
    ],
)
def test_workspace_slug_is_derived_from_name(name, slug):
    assert slugify_workspace_name(name) == slug


def test_same_workspace_name_gets_a_unique_slug(api_client, db_session):
    assert register(api_client).status_code == 201
    assert register(api_client, email="jane@example.com").status_code == 201

    slugs = db_session.scalars(
        select(Workspace.slug).where(Workspace.name == "Example Company")
    ).all()
    assert len(slugs) == 2
    assert len(set(slugs)) == 2
    assert "example-company" in slugs


def test_slug_taken_concurrently_falls_back_to_next_candidate(api_client, db_session, monkeypatch):
    # Simulates a slug that was taken between the existence check and the insert.
    assert register(api_client).status_code == 201
    monkeypatch.setattr(auth_service, "workspace_slug_exists", lambda db, slug: False)

    response = register(api_client, email="jane@example.com")

    assert response.status_code == 201
    jane = user_by_email(db_session, "jane@example.com")
    workspace = db_session.scalar(
        select(Workspace)
        .join(WorkspaceMembership, WorkspaceMembership.workspace_id == Workspace.id)
        .where(WorkspaceMembership.user_id == jane.id)
    )
    assert workspace.slug.startswith("example-company-")


# Password policy


@pytest.mark.parametrize(
    "password",
    [
        "Abcdefghij1!",  # exactly 12 characters
        "Aa1!" + "x" * 124,  # exactly 128 characters
        "Correct Horse 9 Battery!",  # spaces are allowed (but are not special characters)
        "Correct-Horse-9",
        "Paßwort_2026x",
        "Wachtwoord€2026",
        "Wachtwoord😀2026",
        'Wacht"woord2026',
        "Wacht\\woord2026",
        "Wacht~woord2026",
        "Wacht.woord2026",
    ],
)
def test_valid_passwords_are_accepted(api_client, password):
    assert register(api_client, password=password).status_code == 201


@pytest.mark.parametrize(
    ("password", "requirement"),
    [
        ("Abcdefgh1!x", "at least 12 characters"),
        ("Aa1!" + "x" * 125, "at most 128 characters"),
        ("abcdefghij1!", "an uppercase letter (A-Z)"),
        ("ABCDEFGHIJ1!", "a lowercase letter (a-z)"),
        ("Abcdefghijk!", "a digit (0-9)"),
        ("Abcdefghijk1", "a special character"),
        ("Abcdef ghij1", "a special character"),
        ("ÄBCDEFGHIJ1!", "a lowercase letter (a-z)"),
    ],
)
def test_invalid_passwords_are_rejected_with_422(api_client, db_session, password, requirement):
    response = register(api_client, password=password)

    assert_error(response, 422, "VALIDATION_ERROR")
    details = response.json()["error"]["details"]
    assert details == [{"field": "password", "message": details[0]["message"]}]
    assert requirement in details[0]["message"]
    assert password not in response.text
    assert_nothing_created(db_session)


def test_password_message_lists_all_unmet_requirements(api_client):
    response = register(api_client, password="abc")

    message = response.json()["error"]["details"][0]["message"]
    for requirement in ("at least 12", "uppercase", "digit", "special"):
        assert requirement in message
    assert "lowercase" not in message


def test_password_is_not_trimmed(api_client, db_session):
    password = "  Correct-Horse-9  "
    register(api_client, password=password)

    user = user_by_email(db_session, "john@example.com")
    assert verify_password(password, user.password_hash)
    assert not verify_password(password.strip(), user.password_hash)


# Required fields


@pytest.mark.parametrize(
    "field", ["first_name", "last_name", "email", "password", "workspace_name"]
)
def test_missing_field_is_rejected(api_client, db_session, field):
    body = payload()
    del body[field]
    api_client.cookies.clear()

    response = api_client.post(REGISTER_URL, json=body)

    assert_error(response, 422, "VALIDATION_ERROR")
    assert response.json()["error"]["details"][0]["field"] == field
    assert_nothing_created(db_session)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("first_name", "   "),
        ("first_name", "x" * 101),
        ("last_name", ""),
        ("last_name", "x" * 101),
        ("workspace_name", "  "),
        ("workspace_name", "x" * 151),
        ("email", "not-an-email"),
        ("email", ""),
        ("first_name", None),
        ("password", 123456789012),
    ],
)
def test_invalid_field_is_rejected(api_client, db_session, field, value):
    response = register(api_client, **{field: value})

    assert_error(response, 422, "VALIDATION_ERROR")
    assert_nothing_created(db_session)


def test_names_are_trimmed(api_client, db_session):
    register(
        api_client, first_name="  John ", last_name=" Doe  ", workspace_name="  Example Company "
    )

    user = user_by_email(db_session, "john@example.com")
    assert (user.first_name, user.last_name) == ("John", "Doe")
    assert count(db_session, Workspace, Workspace.name == "Example Company") == 1


def test_client_cannot_choose_status_role_or_ids(api_client, db_session):
    forced_id = str(uuid.uuid4())
    response = register(
        api_client, status="INACTIVE", role="VIEWER", id=forced_id, workspace_id=forced_id
    )

    assert response.status_code == 201
    user = user_by_email(db_session, "john@example.com")
    membership = db_session.scalar(
        select(WorkspaceMembership).where(WorkspaceMembership.user_id == user.id)
    )
    assert user.status == "ACTIVE"
    assert str(user.id) != forced_id
    assert membership.role == "ADMIN"
    assert str(membership.workspace_id) != forced_id


# Rate limiting


def test_register_is_rate_limited_to_five_requests_per_minute_per_ip(api_client):
    assert REGISTER_RATE_LIMIT_ATTEMPTS == 5
    responses = [
        register(api_client, email=f"user{i}@example.com", password="weak")
        for i in range(REGISTER_RATE_LIMIT_ATTEMPTS)
    ]
    assert all(response.status_code == 422 for response in responses)

    blocked = register(api_client, email="valid@example.com")

    assert_error(blocked, 429, "RATE_LIMIT_EXCEEDED")
    assert 1 <= int(blocked.headers["Retry-After"]) <= 60


def test_register_rate_limit_is_independent_of_login(api_client):
    for _ in range(5):
        api_client.post("/api/auth/login", json={"email": "x@example.com", "password": "x"})

    assert register(api_client).status_code == 201


# Transactions and unexpected errors


@pytest.mark.parametrize(
    "failing_step",
    ["create_user_session", "create_workspace_membership", "create_access_token"],
)
def test_failure_rolls_back_the_whole_registration(
    api_client, db_session, monkeypatch, failing_step
):
    def fail(*args, **kwargs):
        raise RuntimeError("SELECT secret_internal_detail")

    monkeypatch.setattr(auth_service, failing_step, fail)

    response = register(api_client)

    assert response.status_code == 500
    assert response.json() == {
        "error": {"code": "INTERNAL_SERVER_ERROR", "message": "An unexpected error occurred."},
        "request_id": response.headers["X-Request-ID"],
    }
    assert "set-cookie" not in response.headers
    assert "secret_internal_detail" not in response.text
    assert_nothing_created(db_session)


def test_failure_after_rollback_allows_registering_again(api_client, db_session, monkeypatch):
    def fail(*args, **kwargs):
        raise RuntimeError("boom")

    with monkeypatch.context() as patch:
        patch.setattr(auth_service, "create_user_session", fail)
        assert register(api_client).status_code == 500

    assert register(api_client).status_code == 201
    assert count(db_session, User, User.email == "john@example.com") == 1


# Sensitive data


def test_password_and_tokens_are_never_logged(api_client, caplog):
    caplog.set_level(logging.DEBUG)

    response = register(api_client)
    register(api_client)  # duplicate
    register(api_client, email="other@example.com", password="weak-password")

    refresh_token = response_cookie(response).value
    access_token = response.json()["access_token"]
    formatter = JsonFormatter()
    output = "\n".join(formatter.format(record) for record in caplog.records)
    for secret in (PASSWORD, "weak-password", refresh_token, access_token):
        assert secret not in output
    events = [json.loads(formatter.format(r)).get("event") for r in caplog.records]
    assert "REGISTER_SUCCESS" in events
    assert "REGISTER_FAILED" in events


def test_response_never_contains_password_or_hash(api_client, db_session):
    response = register(api_client)

    user = user_by_email(db_session, "john@example.com")
    assert PASSWORD not in response.text
    assert user.password_hash not in response.text
    assert "password" not in response.text


def test_register_is_public_and_listed_without_security():
    from app.main import create_app

    operation = create_app().openapi()["paths"][REGISTER_URL]["post"]

    assert "security" not in operation
    assert "201" in operation["responses"]
