from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, EmailStr, Field, field_validator
from pydantic_core import PydanticCustomError

from app.modules.auth.password_policy import password_policy_message, password_policy_violations
from app.modules.users.email import normalize_email

PASSWORD_MAX_LENGTH = 1024


def _normalize_email_input(value: object) -> object:
    return normalize_email(value) if isinstance(value, str) else value


NormalizedEmail = Annotated[EmailStr, BeforeValidator(_normalize_email_input)]


class LoginRequest(BaseModel):
    email: NormalizedEmail
    # The password is intentionally not stripped or normalized before verification.
    password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)


def _strip(value: object) -> object:
    return value.strip() if isinstance(value, str) else value


TrimmedName = Annotated[str, BeforeValidator(_strip), Field(min_length=1, max_length=100)]


class RegisterRequest(BaseModel):
    first_name: TrimmedName
    last_name: TrimmedName
    email: NormalizedEmail
    # Validated against the Nimbus Password Policy, never trimmed or normalized.
    password: str
    workspace_name: Annotated[str, BeforeValidator(_strip), Field(min_length=1, max_length=150)]

    @field_validator("password")
    @classmethod
    def validate_password_policy(cls, password: str) -> str:
        violations = password_policy_violations(password)
        if violations:
            # The message lists unmet requirements only; the password itself is never echoed.
            raise PydanticCustomError("password_policy", password_policy_message(violations))
        return password


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
