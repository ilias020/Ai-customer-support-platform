from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BACKEND_DIRECTORY = Path(__file__).resolve().parents[2]

MINIMUM_SECRET_LENGTH = 32


class Settings(BaseSettings):
    app_name: str = Field(default="Nimbus API", alias="APP_NAME")
    environment: Literal["development", "testing", "production"] = Field(alias="ENVIRONMENT")
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(
        default="INFO",
        alias="LOG_LEVEL",
    )
    database_url: str = Field(alias="DATABASE_URL", repr=False, exclude=True)
    claude_api_key: str = Field(default="", alias="CLAUDE_API_KEY", repr=False, exclude=True)
    jwt_secret_key: str = Field(alias="JWT_SECRET_KEY", repr=False, exclude=True)
    refresh_token_hash_key: str = Field(
        alias="REFRESH_TOKEN_HASH_KEY",
        repr=False,
        exclude=True,
    )
    access_token_expire_minutes: int = Field(
        default=15,
        alias="ACCESS_TOKEN_EXPIRE_MINUTES",
        gt=0,
    )
    refresh_token_expire_days: int = Field(default=30, alias="REFRESH_TOKEN_EXPIRE_DAYS", gt=0)
    cors_allowed_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=list,
        alias="CORS_ALLOWED_ORIGINS",
    )

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIRECTORY / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, value: str) -> str:
        if not value.startswith("postgresql+psycopg://"):
            raise ValueError("DATABASE_URL must use the postgresql+psycopg driver")
        return value

    @field_validator("jwt_secret_key", "refresh_token_hash_key")
    @classmethod
    def validate_secret_length(cls, value: str) -> str:
        if len(value) < MINIMUM_SECRET_LENGTH:
            raise ValueError(f"Secret must contain at least {MINIMUM_SECRET_LENGTH} characters")
        return value

    @field_validator("cors_allowed_origins", mode="before")
    @classmethod
    def parse_cors_allowed_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("cors_allowed_origins")
    @classmethod
    def validate_cors_allowed_origins(cls, value: list[str]) -> list[str]:
        for origin in value:
            if origin == "*":
                raise ValueError("CORS_ALLOWED_ORIGINS must not contain a wildcard origin")
            if not origin.startswith(("http://", "https://")) or origin.endswith("/"):
                raise ValueError("CORS_ALLOWED_ORIGINS must contain explicit http(s) origins")
        return value

    @model_validator(mode="after")
    def validate_distinct_secrets(self) -> "Settings":
        if self.jwt_secret_key == self.refresh_token_hash_key:
            raise ValueError("JWT_SECRET_KEY and REFRESH_TOKEN_HASH_KEY must be different")
        return self


settings = Settings()
