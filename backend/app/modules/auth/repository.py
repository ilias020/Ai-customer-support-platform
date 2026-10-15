import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.modules.auth.models import UserSession


def create_user_session(
    db: Session,
    *,
    user_id: uuid.UUID,
    token_hash: str,
    expires_at: datetime,
) -> UserSession:
    user_session = UserSession(
        id=uuid.uuid4(),
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(user_session)
    db.flush()
    return user_session


@dataclass(frozen=True)
class RotatedUserSession:
    id: uuid.UUID
    user_id: uuid.UUID
    expires_at: datetime


def rotate_user_session_token(
    db: Session,
    *,
    current_token_hash: str,
    new_token_hash: str,
    now: datetime,
) -> RotatedUserSession | None:
    """Atomically replaces the token hash of an active, non-expired session.

    The conditional UPDATE locks the session row. A concurrent request with the same token
    re-evaluates the WHERE clause after the first transaction commits and no longer matches,
    so a refresh token can only be rotated once. `expires_at` is never changed.
    """
    row = db.execute(
        update(UserSession)
        .where(
            UserSession.token_hash == current_token_hash,
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > now,
        )
        .values(token_hash=new_token_hash)
        .returning(UserSession.id, UserSession.user_id, UserSession.expires_at)
        .execution_options(synchronize_session=False)
    ).one_or_none()

    if row is None:
        return None

    # TIMESTAMPTZ values are returned in the database session time zone; normalize to UTC.
    return RotatedUserSession(
        id=row.id,
        user_id=row.user_id,
        expires_at=row.expires_at.astimezone(UTC),
    )


@dataclass(frozen=True)
class RevokedUserSession:
    id: uuid.UUID
    user_id: uuid.UUID


def revoke_user_session(
    db: Session,
    *,
    token_hash: str,
    now: datetime,
) -> RevokedUserSession | None:
    """Atomically revokes the active, non-expired session that owns `token_hash`.

    Uses the same conditional UPDATE as token rotation, so both statements lock the same row and
    are serialized: a session that is revoked can no longer be rotated, and a token that was just
    rotated no longer matches here. Only this one session is changed.
    """
    row = db.execute(
        update(UserSession)
        .where(
            UserSession.token_hash == token_hash,
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > now,
        )
        .values(revoked_at=now)
        .returning(UserSession.id, UserSession.user_id)
        .execution_options(synchronize_session=False)
    ).one_or_none()

    if row is None:
        return None

    return RevokedUserSession(id=row.id, user_id=row.user_id)
