from fastapi.testclient import TestClient

from app.main import app
from app.models.workspace import Workspace
from app.schemas.workspace import WorkspaceCreate

client = TestClient(app)


def test_health_check():
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


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
