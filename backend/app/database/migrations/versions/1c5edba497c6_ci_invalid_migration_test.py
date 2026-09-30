"""ci invalid migration test

Revision ID: 1c5edba497c6
Revises: 851b140776d8
Create Date: 2026-09-30 15:08:16.445729

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1c5edba497c6'
down_revision: Union[str, Sequence[str], None] = '851b140776d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    raise RuntimeError("Intentional CI migration failure")


def downgrade() -> None:
    """Downgrade schema."""
    pass
