from pathlib import Path

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings
from app.database.alembic import escape_alembic_config_value
from app.main import app, create_app
from app.modules.workspaces.models import Workspace
from app.modules.workspaces.schemas import WorkspaceCreate

client = TestClient(app)


def test_health_check():
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_application_starts():
    test_app = create_app()

    assert test_app.title == "Nimbus API"


def test_missing_required_configuration_is_reported(monkeypatch):
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_invalid_database_url_is_reported():
    with pytest.raises(ValidationError):
        Settings(
            environment="testing",
            database_url="",
            _env_file=None,
        )


def test_alembic_accepts_percent_encoded_database_password():
    database_url = "postgresql+psycopg://nimbus:p%40ss@127.0.0.1:5432/nimbus"
    alembic_config = Config()

    alembic_config.set_main_option(
        "sqlalchemy.url",
        escape_alembic_config_value(database_url),
    )

    assert alembic_config.get_main_option("sqlalchemy.url") == database_url


def test_sensitive_configuration_is_excluded_from_output():
    test_settings = Settings(
        environment="testing",
        database_url="postgresql+psycopg://user:database-secret@localhost/nimbus",
        claude_api_key="provider-secret",
        jwt_secret_key="jwt-secret",
    )

    rendered_settings = repr(test_settings)
    dumped_settings = test_settings.model_dump()

    assert "database-secret" not in rendered_settings
    assert "provider-secret" not in rendered_settings
    assert "jwt-secret" not in rendered_settings
    assert "database_url" not in dumped_settings
    assert "claude_api_key" not in dumped_settings
    assert "jwt_secret_key" not in dumped_settings


def test_unhandled_exception_returns_safe_response():
    test_app = create_app()

    @test_app.get("/test-error")
    def raise_internal_error():
        raise RuntimeError("sensitive technical detail")

    test_client = TestClient(test_app, raise_server_exceptions=False)
    response = test_client.get("/test-error")

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error."}
    assert "sensitive technical detail" not in response.text


def test_required_project_structure_exists():
    app_directory = Path(__file__).parents[1] / "app"

    for directory in ("api", "core", "database", "modules", "integrations", "shared"):
        assert (app_directory / directory).is_dir()


def test_company_endpoints_are_removed():
    response = client.get("/api/companies")

    assert response.status_code == 404


def test_workspace_model_uses_expected_table():
    assert Workspace.__tablename__ == "workspaces"
    assert {column.name for column in Workspace.__table__.columns} == {
        "id",
        "name",
        "slug",
        "status",
        "website",
        "logo_url",
        "created_at",
        "updated_at",
    }


def test_workspace_create_schema():
    workspace = WorkspaceCreate(name="Nimbus", slug="nimbus")

    assert workspace.name == "Nimbus"
    assert workspace.slug == "nimbus"
