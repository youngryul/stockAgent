"""Add portfolio cash balance and position display name.

Revision ID: 0003_portfolio_cash
Revises: 0002_horizon_scan
Create Date: 2026-08-18
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_portfolio_cash"
down_revision: Union[str, None] = "0002_horizon_scan"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "portfolio_positions",
        sa.Column("name", sa.String(length=128), nullable=False, server_default=""),
    )
    op.create_table(
        "portfolio_cash",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("cash_amount", sa.Float(), nullable=False, server_default="0"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute("INSERT INTO portfolio_cash (id, cash_amount) VALUES (1, 0)")


def downgrade() -> None:
    op.drop_table("portfolio_cash")
    op.drop_column("portfolio_positions", "name")
