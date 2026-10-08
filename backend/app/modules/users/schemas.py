import uuid
from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, field_validator

from app.modules.users.models import UserStatus


class CurrentUserResponse(BaseModel):
    """Account details of the authenticated user (`GET /api/users/me`).

    Fields are listed explicitly so that new or sensitive `User` columns (such as
    `password_hash`) are never exposed automatically.
    """

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    first_name: str
    last_name: str
    status: UserStatus
    language: str
    timezone: str
    last_login_at: datetime | None
    created_at: datetime

    @field_validator("last_login_at", "created_at")
    @classmethod
    def normalize_to_utc(cls, value: datetime | None) -> datetime | None:
        # PostgreSQL returns TIMESTAMPTZ values in the session time zone; the API always
        # responds in UTC (ISO 8601 with `Z`).
        return value.astimezone(UTC) if value is not None else None
