import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.request_id import get_request_id
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_dummy_password,
    verify_password,
)
from app.modules.auth.exceptions import (
    EmailAlreadyExistsError,
    InvalidCredentialsError,
    InvalidRefreshTokenError,
)
from app.modules.auth.repository import create_user_session, rotate_user_session_token
from app.modules.users.models import User, UserStatus
from app.modules.users.repository import create_user, get_user_by_email
from app.modules.workspaces.models import Workspace, WorkspaceRole
from app.modules.workspaces.repository import (
    create_workspace,
    create_workspace_membership,
    workspace_slug_candidates,
    workspace_slug_exists,
)

logger = logging.getLogger(__name__)

LOGIN_SUCCESS = "LOGIN_SUCCESS"
LOGIN_FAILED = "LOGIN_FAILED"
REFRESH_SUCCESS = "REFRESH_SUCCESS"
REFRESH_FAILED = "REFRESH_FAILED"
REGISTER_SUCCESS = "REGISTER_SUCCESS"
REGISTER_FAILED = "REGISTER_FAILED"

# Unique indexes that registration relies on (see the Alembic migrations).
USERS_EMAIL_UNIQUE_INDEX = "ix_users_email"
WORKSPACES_SLUG_UNIQUE_INDEX = "ix_workspaces_slug"
WORKSPACE_SLUG_ATTEMPTS = 5

# Opaque refresh tokens are generated with 32 random bytes (43 URL-safe characters).
# Clearly malformed cookie values are rejected without a database lookup.
REFRESH_TOKEN_MAX_LENGTH = 256


@dataclass(frozen=True)
class LoginResult:
    access_token: str
    expires_in: int
    refresh_token: str
    refresh_token_expires_at: datetime
    refresh_token_max_age: int


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
        refresh_token_max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
    )


def log_refresh_failed(failure_reason: str) -> None:
    logger.warning(
        REFRESH_FAILED,
        extra={
            "event": REFRESH_FAILED,
            "failure_reason": failure_reason,
            "request_id": get_request_id(),
        },
    )


def refresh_session(db: Session, *, refresh_token: str | None) -> LoginResult:
    """Issues a new access token and rotates the refresh token of an active UserSession.

    The session keeps its original `expires_at`: refreshing never extends the maximum session
    lifetime that was set when the session was created.
    """
    if not refresh_token or len(refresh_token) > REFRESH_TOKEN_MAX_LENGTH:
        log_refresh_failed("MISSING_OR_MALFORMED_TOKEN")
        raise InvalidRefreshTokenError()

    now = datetime.now(UTC)
    new_refresh_token = generate_refresh_token()

    try:
        rotated_session = rotate_user_session_token(
            db,
            current_token_hash=hash_refresh_token(refresh_token),
            new_token_hash=hash_refresh_token(new_refresh_token),
            now=now,
        )

        if rotated_session is None:
            db.rollback()
            log_refresh_failed("INVALID_TOKEN")
            raise InvalidRefreshTokenError()

        user = db.get(User, rotated_session.user_id)
        if user is None or user.status != UserStatus.ACTIVE:
            db.rollback()
            log_refresh_failed("INACTIVE_USER")
            raise InvalidRefreshTokenError()

        access_token = create_access_token(str(rotated_session.user_id), issued_at=now)
        db.commit()
    except InvalidRefreshTokenError:
        raise
    except Exception:
        db.rollback()
        log_refresh_failed("INTERNAL_ERROR")
        raise

    logger.info(
        REFRESH_SUCCESS,
        extra={
            "event": REFRESH_SUCCESS,
            "user_id": str(rotated_session.user_id),
            "session_id": str(rotated_session.id),
            "request_id": get_request_id(),
        },
    )

    return LoginResult(
        access_token=access_token,
        expires_in=settings.access_token_expire_minutes * 60,
        refresh_token=new_refresh_token,
        refresh_token_expires_at=rotated_session.expires_at,
        refresh_token_max_age=int((rotated_session.expires_at - now).total_seconds()),
    )


def log_register_failed(failure_reason: str) -> None:
    logger.warning(
        REGISTER_FAILED,
        extra={
            "event": REGISTER_FAILED,
            "failure_reason": failure_reason,
            "request_id": get_request_id(),
        },
    )


def _is_unique_violation(error: IntegrityError, index_name: str) -> bool:
    diagnostics = getattr(error.orig, "diag", None)
    return getattr(diagnostics, "constraint_name", None) == index_name


def _create_user_or_conflict(db: Session, **values) -> User:
    try:
        return create_user(db, **values)
    except IntegrityError as error:
        # A concurrent registration with the same e-mail committed first. The caller rolls
        # back the whole registration, so no savepoint is needed here.
        if _is_unique_violation(error, USERS_EMAIL_UNIQUE_INDEX):
            raise EmailAlreadyExistsError() from None
        raise


def _create_workspace_with_unique_slug(db: Session, *, name: str) -> Workspace:
    for slug in workspace_slug_candidates(name, WORKSPACE_SLUG_ATTEMPTS):
        if workspace_slug_exists(db, slug):
            continue
        try:
            with db.begin_nested():
                return create_workspace(db, name=name, slug=slug)
        except IntegrityError as error:
            # Another registration took this slug concurrently: try the next candidate.
            if not _is_unique_violation(error, WORKSPACES_SLUG_UNIQUE_INDEX):
                raise
    raise RuntimeError("No unique workspace slug could be generated.")


def register(
    db: Session,
    *,
    first_name: str,
    last_name: str,
    email: str,
    password: str,
    workspace_name: str,
) -> LoginResult:
    """Registers a new account and signs it in (API Design §6).

    In one transaction: an ACTIVE User, a Workspace, an ADMIN WorkspaceMembership and a
    UserSession. Tokens are only returned after the commit succeeded; on any error the whole
    registration is rolled back. `email` must already be normalized and `password` must comply
    with the Nimbus Password Policy (validated by the request schema).
    """
    if get_user_by_email(db, email) is not None:
        log_register_failed("EMAIL_ALREADY_EXISTS")
        raise EmailAlreadyExistsError()

    password_hash = hash_password(password)
    now = datetime.now(UTC)
    refresh_token = generate_refresh_token()
    refresh_token_expires_at = now + timedelta(days=settings.refresh_token_expire_days)

    try:
        user = _create_user_or_conflict(
            db,
            first_name=first_name,
            last_name=last_name,
            email=email,
            password_hash=password_hash,
            last_login_at=now,
        )
        user_id = user.id
        workspace = _create_workspace_with_unique_slug(db, name=workspace_name)
        workspace_id = workspace.id
        create_workspace_membership(
            db,
            workspace_id=workspace_id,
            user_id=user_id,
            role=WorkspaceRole.ADMIN,
            joined_at=now,
        )
        user_session = create_user_session(
            db,
            user_id=user_id,
            token_hash=hash_refresh_token(refresh_token),
            expires_at=refresh_token_expires_at,
        )
        session_id = user_session.id
        access_token = create_access_token(str(user_id), issued_at=now)
        db.commit()
    except EmailAlreadyExistsError:
        db.rollback()
        log_register_failed("EMAIL_ALREADY_EXISTS")
        raise
    except Exception:
        db.rollback()
        log_register_failed("INTERNAL_ERROR")
        raise

    logger.info(
        REGISTER_SUCCESS,
        extra={
            "event": REGISTER_SUCCESS,
            "user_id": str(user_id),
            "workspace_id": str(workspace_id),
            "session_id": str(session_id),
            "request_id": get_request_id(),
        },
    )

    return LoginResult(
        access_token=access_token,
        expires_in=settings.access_token_expire_minutes * 60,
        refresh_token=refresh_token,
        refresh_token_expires_at=refresh_token_expires_at,
        refresh_token_max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
    )
