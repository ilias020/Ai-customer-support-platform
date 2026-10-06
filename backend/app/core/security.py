import hashlib
import hmac
import secrets
from datetime import datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.core.config import settings

ACCESS_TOKEN_TYPE = "access"
JWT_ALGORITHM = "HS256"
REFRESH_TOKEN_BYTES = 32

# argon2-cffi uses Argon2id with the RFC 9106 low-memory profile by default.
_password_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


# Used to spend comparable verification time when no user matches the login email.
_DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(32))


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _password_hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def verify_dummy_password(password: str) -> None:
    verify_password(password, _DUMMY_PASSWORD_HASH)


def create_access_token(subject: str, issued_at: datetime) -> str:
    expires_at = issued_at + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": subject,
        "iat": issued_at,
        "exp": expires_at,
        "token_type": ACCESS_TOKEN_TYPE,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=JWT_ALGORITHM)


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(REFRESH_TOKEN_BYTES)


def hash_refresh_token(refresh_token: str) -> str:
    return hmac.new(
        settings.refresh_token_hash_key.encode("utf-8"),
        refresh_token.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
