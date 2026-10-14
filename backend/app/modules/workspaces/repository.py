import re
import secrets
import unicodedata
import uuid
from datetime import datetime

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.modules.workspaces.models import (
    MembershipStatus,
    Workspace,
    WorkspaceMembership,
    WorkspaceRole,
)

WORKSPACE_SLUG_BASE_MAX_LENGTH = 100
WORKSPACE_SLUG_FALLBACK = "workspace"


def slugify_workspace_name(name: str) -> str:
    """Lowercase ASCII slug: accents removed, other characters replaced by single hyphens."""
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")
    return slug[:WORKSPACE_SLUG_BASE_MAX_LENGTH].strip("-") or WORKSPACE_SLUG_FALLBACK


def workspace_slug_candidates(name: str, attempts: int) -> list[str]:
    """The plain slug first, then variants with a random suffix for slugs already in use."""
    base = slugify_workspace_name(name)
    return [base] + [f"{base}-{secrets.token_hex(3)}" for _ in range(attempts - 1)]


def workspace_slug_exists(db: Session, slug: str) -> bool:
    return bool(db.scalar(select(exists().where(Workspace.slug == slug))))


def create_workspace(db: Session, *, name: str, slug: str) -> Workspace:
    """Adds a workspace and flushes, so a duplicate slug fails on the unique index."""
    workspace = Workspace(id=uuid.uuid4(), name=name, slug=slug, status="ACTIVE")
    db.add(workspace)
    db.flush()
    return workspace


def create_workspace_membership(
    db: Session,
    *,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    role: WorkspaceRole,
    joined_at: datetime,
) -> WorkspaceMembership:
    membership = WorkspaceMembership(
        id=uuid.uuid4(),
        workspace_id=workspace_id,
        user_id=user_id,
        role=role,
        status=MembershipStatus.ACTIVE,
        joined_at=joined_at,
    )
    db.add(membership)
    db.flush()
    return membership
