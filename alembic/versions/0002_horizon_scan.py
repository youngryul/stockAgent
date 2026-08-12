"""Add scan mode, signal horizon/source fields.

Revision ID: 0002_horizon_scan
Revises: 0001_initial
Create Date: 2026-07-23
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_horizon_scan"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "analysis_runs",
        sa.Column("mode", sa.String(length=16), nullable=False, server_default="watchlist"),
    )
    op.add_column(
        "signals",
        sa.Column("horizon", sa.String(length=8), nullable=False, server_default="SHORT"),
    )
    op.add_column(
        "signals",
        sa.Column("source", sa.String(length=16), nullable=False, server_default="WATCHLIST"),
    )
    op.add_column(
        "signals",
        sa.Column("holding_period_hint", sa.String(length=64), nullable=True),
    )
    op.create_index("ix_signals_horizon", "signals", ["horizon"])


def downgrade() -> None:
    op.drop_index("ix_signals_horizon", table_name="signals")
    op.drop_column("signals", "holding_period_hint")
    op.drop_column("signals", "source")
    op.drop_column("signals", "horizon")
    op.drop_column("analysis_runs", "mode")
