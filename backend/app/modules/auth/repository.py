import uuid
from datetime import datetime

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
