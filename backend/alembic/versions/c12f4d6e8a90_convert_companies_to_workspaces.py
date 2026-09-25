"""convert companies to workspaces

Revision ID: c12f4d6e8a90
Revises: 851b140776d8
Create Date: 2026-09-25

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c12f4d6e8a90"
down_revision: Union[str, Sequence[str], None] = "851b140776d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.rename_table("companies", "workspaces")
    op.drop_index("ix_companies_id", table_name="workspaces")
    op.drop_index("ix_companies_slug", table_name="workspaces")

    op.execute("ALTER TABLE workspaces ALTER COLUMN id DROP DEFAULT")
    op.alter_column(
        "workspaces",
        "id",
        existing_type=sa.Integer(),
        type_=sa.UUID(),
        postgresql_using="gen_random_uuid()",
    )
    op.alter_column(
        "workspaces",
        "name",
        existing_type=sa.String(length=255),
        type_=sa.String(length=150),
        existing_nullable=False,
    )
    op.alter_column(
        "workspaces",
        "slug",
        existing_type=sa.String(length=100),
        type_=sa.String(length=150),
        existing_nullable=False,
    )
    op.add_column(
        "workspaces",
        sa.Column("status", sa.String(length=30), server_default="ACTIVE", nullable=False),
    )
    op.add_column("workspaces", sa.Column("website", sa.Text(), nullable=True))
    op.add_column("workspaces", sa.Column("logo_url", sa.Text(), nullable=True))
    op.create_index("ix_workspaces_slug", "workspaces", ["slug"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_workspaces_slug", table_name="workspaces")
    op.drop_column("workspaces", "logo_url")
    op.drop_column("workspaces", "website")
    op.drop_column("workspaces", "status")
    op.alter_column(
        "workspaces",
        "slug",
        existing_type=sa.String(length=150),
        type_=sa.String(length=100),
        existing_nullable=False,
    )
    op.alter_column(
        "workspaces",
        "name",
        existing_type=sa.String(length=150),
        type_=sa.String(length=255),
        existing_nullable=False,
    )
    op.add_column("workspaces", sa.Column("legacy_id", sa.Integer(), nullable=True))
    op.execute(
        """
        WITH numbered_workspaces AS (
            SELECT id, row_number() OVER (ORDER BY created_at, id) AS legacy_id
            FROM workspaces
        )
        UPDATE workspaces
        SET legacy_id = numbered_workspaces.legacy_id
        FROM numbered_workspaces
        WHERE workspaces.id = numbered_workspaces.id
        """
    )
    op.drop_constraint("companies_pkey", "workspaces", type_="primary")
    op.drop_column("workspaces", "id")
    op.alter_column("workspaces", "legacy_id", nullable=False)
    op.alter_column("workspaces", "legacy_id", new_column_name="id")
    op.rename_table("workspaces", "companies")
    op.create_primary_key("companies_pkey", "companies", ["id"])
    op.create_index("ix_companies_id", "companies", ["id"], unique=False)
    op.create_index("ix_companies_slug", "companies", ["slug"], unique=True)
