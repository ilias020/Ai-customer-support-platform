from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIRECTORY = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = Field(default="Nimbus API", alias="APP_NAME")
    environment: Literal["development", "testing", "production"] = Field(alias="ENVIRONMENT")
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(
        default="INFO",
        alias="LOG_LEVEL",
    )
    database_url: str = Field(default="", alias="DATABASE_URL", repr=False, exclude=True)
    claude_api_key: str = Field(default="", alias="CLAUDE_API_KEY", repr=False, exclude=True)
    jwt_secret_key: str = Field(default="", alias="JWT_SECRET_KEY", repr=False, exclude=True)

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIRECTORY / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )


settings = Settings()
