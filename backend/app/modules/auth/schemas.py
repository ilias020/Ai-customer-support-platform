from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, EmailStr, Field

from app.modules.users.email import normalize_email

PASSWORD_MAX_LENGTH = 1024


def _normalize_email_input(value: object) -> object:
    return normalize_email(value) if isinstance(value, str) else value


NormalizedEmail = Annotated[EmailStr, BeforeValidator(_normalize_email_input)]


class LoginRequest(BaseModel):
    email: NormalizedEmail
    # The password is intentionally not stripped or normalized before verification.
    password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
