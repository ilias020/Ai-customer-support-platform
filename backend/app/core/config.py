from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AI Customer Support Platform API"
    environment: str = "development"
    database_url: str = Field(default="", alias="DATABASE_URL")
    claude_api_key: str = Field(default="", alias="CLAUDE_API_KEY")
    jwt_secret_key: str = Field(default="", alias="JWT_SECRET_KEY")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()