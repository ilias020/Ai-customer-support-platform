import hashlib
import hmac
import json
import logging
import re
from datetime import UTC, datetime

import jwt
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core import security
from app.core.config import Settings, settings
from app.core.logging import JsonFormatter
from app.core.rate_limit import InMemoryRateLimiter
from app.main import create_app
from app.modules.users.email import normalize_email

VALID_SECRETS = {
    "jwt_secret_key": "test-only-jwt-value-for-settings-tests-00",
    "refresh_token_hash_key": "test-only-refresh-value-for-settings-tests",
}


def build_settings(**overrides) -> Settings:
    values = {
        "environment": "testing",
        "database_url": "postgresql+psycopg://user:pass@localhost/nimbus",
        **VALID_SECRETS,
        **overrides,
    }
    return Settings(_env_file=None, **values)


# Password hashing


def test_password_hash_uses_argon2id_and_verifies():
    password_hash = security.hash_password("Correct-Horse-Battery-1")

    assert password_hash.startswith("$argon2id$")
    assert security.verify_password("Correct-Horse-Battery-1", password_hash)
    assert not security.verify_password("wrong", password_hash)


def test_verify_password_rejects_invalid_hash():
    assert not security.verify_password("password", "not-a-valid-hash")


# Tokens


def test_access_token_contains_only_required_claims():
    issued_at = datetime.now(UTC).replace(microsecond=0)

    token = security.create_access_token("user-id", issued_at=issued_at)

    claims = jwt.decode(token, settings.jwt_secret_key, algorithms=["HS256"])
    assert set(claims) == {"sub", "iat", "exp", "token_type"}
    assert claims["sub"] == "user-id"
    assert claims["token_type"] == "access"
    assert claims["exp"] - claims["iat"] == settings.access_token_expire_minutes * 60


def test_refresh_tokens_are_random_and_high_entropy():
    tokens = {security.generate_refresh_token() for _ in range(100)}

    assert len(tokens) == 100
    assert all(len(token) >= 43 for token in tokens)


def test_refresh_token_hash_is_hmac_sha256_with_dedicated_key(monkeypatch):
    token = security.generate_refresh_token()

    token_hash = security.hash_refresh_token(token)

    expected = hmac.new(
        settings.refresh_token_hash_key.encode(), token.encode(), hashlib.sha256
    ).hexdigest()
    assert token_hash == expected
    assert token_hash == security.hash_refresh_token(token)
    assert token_hash != hashlib.sha256(token.encode()).hexdigest()

    monkeypatch.setattr(settings, "refresh_token_hash_key", "another-hash-key-value-000000000000")
    assert security.hash_refresh_token(token) != token_hash


# E-mail normalization


def test_normalize_email_trims_and_lowercases():
    assert normalize_email("  John.Doe@Example.COM \t") == "john.doe@example.com"


# Rate limiter


def test_rate_limiter_blocks_after_limit_and_resets_after_window():
    now = [1000.0]
    limiter = InMemoryRateLimiter(max_attempts=5, window_seconds=60, clock=lambda: now[0])

    assert all(limiter.hit("10.0.0.1") is None for _ in range(5))
    assert limiter.hit("10.0.0.1") == 60
    assert limiter.hit("10.0.0.2") is None

    now[0] += 30
    assert limiter.hit("10.0.0.1") == 30

    now[0] += 30
    assert limiter.hit("10.0.0.1") is None


# Configuration


@pytest.mark.parametrize("missing", ["JWT_SECRET_KEY", "REFRESH_TOKEN_HASH_KEY"])
def test_missing_secret_is_reported(monkeypatch, missing):
    monkeypatch.setenv("ENVIRONMENT", "testing")
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://user:pass@localhost/nimbus")
    monkeypatch.setenv("JWT_SECRET_KEY", VALID_SECRETS["jwt_secret_key"])
    monkeypatch.setenv("REFRESH_TOKEN_HASH_KEY", VALID_SECRETS["refresh_token_hash_key"])
    monkeypatch.delenv(missing)

    with pytest.raises(ValidationError):
        Settings(_env_file=None)


@pytest.mark.parametrize("field", ["jwt_secret_key", "refresh_token_hash_key"])
@pytest.mark.parametrize("value", ["", "too-short"])
def test_weak_secret_is_reported(field, value):
    with pytest.raises(ValidationError):
        build_settings(**{field: value})


def test_identical_secrets_are_reported():
    shared = "shared-secret-value-0000000000000000"

    with pytest.raises(ValidationError):
        build_settings(jwt_secret_key=shared, refresh_token_hash_key=shared)


def test_cors_origins_are_parsed_from_comma_separated_env(monkeypatch):
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000, https://app.example.com")

    test_settings = build_settings()

    assert test_settings.cors_allowed_origins == [
        "http://localhost:3000",
        "https://app.example.com",
    ]


@pytest.mark.parametrize("origins", ["*", "http://localhost:3000,*", "localhost:3000"])
def test_invalid_cors_origins_are_reported(monkeypatch, origins):
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", origins)

    with pytest.raises(ValidationError):
        build_settings()


# CORS


def test_cors_allows_configured_origin_with_credentials(monkeypatch):
    monkeypatch.setattr(settings, "cors_allowed_origins", ["http://localhost:3000"])
    client = TestClient(create_app())

    response = client.options(
        "/api/auth/login",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert response.headers["access-control-allow-credentials"] == "true"


def test_cors_rejects_unknown_origin(monkeypatch):
    monkeypatch.setattr(settings, "cors_allowed_origins", ["http://localhost:3000"])
    client = TestClient(create_app())

    response = client.get("/api/health", headers={"Origin": "https://evil.example.com"})

    assert "access-control-allow-origin" not in response.headers


# Request ID and error structure


def test_every_response_has_server_generated_request_id():
    client = TestClient(create_app())

    first = client.get("/api/health", headers={"X-Request-ID": "client-supplied"})
    second = client.get("/api/health")

    assert re.fullmatch(r"req_[0-9a-f]{32}", first.headers["X-Request-ID"])
    assert first.headers["X-Request-ID"] != second.headers["X-Request-ID"]


# Structured logging


def test_json_formatter_outputs_structured_fields():
    record = logging.LogRecord(
        "nimbus.test", logging.INFO, __file__, 1, "LOGIN_SUCCESS", None, None
    )
    record.event = "LOGIN_SUCCESS"
    record.request_id = "req_123"

    payload = json.loads(JsonFormatter().format(record))

    assert payload["message"] == "LOGIN_SUCCESS"
    assert payload["level"] == "INFO"
    assert payload["event"] == "LOGIN_SUCCESS"
    assert payload["request_id"] == "req_123"
    assert "timestamp" in payload
