import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.users.models import User, UserStatus


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email))


def get_user_by_id(db: Session, user_id: uuid.UUID) -> User | None:
    return db.get(User, user_id)


def create_user(
    db: Session,
    *,
    first_name: str,
    last_name: str,
    email: str,
    password_hash: str,
    last_login_at: datetime,
) -> User:
    """Adds an ACTIVE user and flushes, so a duplicate e-mail fails on the unique index."""
    user = User(
        id=uuid.uuid4(),
        first_name=first_name,
        last_name=last_name,
        email=email,
        password_hash=password_hash,
        status=UserStatus.ACTIVE,
        last_login_at=last_login_at,
    )
    db.add(user)
    db.flush()
    return user
