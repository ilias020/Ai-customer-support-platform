import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.request_id import get_request_id
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_refresh_token,
    verify_dummy_password,
    verify_password,
)
from app.modules.auth.exceptions import InvalidCredentialsError
from app.modules.auth.repository import create_user_session
from app.modules.users.models import UserStatus
from app.modules.users.repository import get_user_by_email

logger = logging.getLogger(__name__)

LOGIN_SUCCESS = "LOGIN_SUCCESS"
LOGIN_FAILED = "LOGIN_FAILED"


@dataclass(frozen=True)
class LoginResult:
    access_token: str
    expires_in: int
    refresh_token: str
    refresh_token_expires_at: datetime


def log_login_failed(failure_reason: str) -> None:
    logger.warning(
        LOGIN_FAILED,
        extra={
            "event": LOGIN_FAILED,
            "failure_reason": failure_reason,
            "request_id": get_request_id(),
        },
    )


def login(db: Session, *, email: str, password: str) -> LoginResult:
    """Authenticates an ACTIVE user and creates a new UserSession.

    `email` must already be normalized. The password is verified exactly as received.
    """
    user = get_user_by_email(db, email)

    if user is None:
        verify_dummy_password(password)
        log_login_failed("INVALID_CREDENTIALS")
        raise InvalidCredentialsError()

    password_is_valid = verify_password(password, user.password_hash)
    if not password_is_valid or user.status != UserStatus.ACTIVE:
        log_login_failed("INVALID_CREDENTIALS")
        raise InvalidCredentialsError()

    user_id = user.id
    now = datetime.now(UTC)
    access_token = create_access_token(str(user_id), issued_at=now)
    refresh_token = generate_refresh_token()
    refresh_token_expires_at = now + timedelta(days=settings.refresh_token_expire_days)

    try:
        user_session = create_user_session(
            db,
            user_id=user_id,
            token_hash=hash_refresh_token(refresh_token),
            expires_at=refresh_token_expires_at,
        )
        session_id = user_session.id
        user.last_login_at = now
        db.commit()
    except Exception:
        db.rollback()
        log_login_failed("SESSION_CREATION_FAILED")
        raise

    logger.info(
        LOGIN_SUCCESS,
        extra={
            "event": LOGIN_SUCCESS,
            "user_id": str(user_id),
            "session_id": str(session_id),
            "request_id": get_request_id(),
        },
    )

    return LoginResult(
        access_token=access_token,
        expires_in=settings.access_token_expire_minutes * 60,
        refresh_token=refresh_token,
        refresh_token_expires_at=refresh_token_expires_at,
    )
