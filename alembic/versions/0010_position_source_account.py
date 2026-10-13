"""Track which KIS account each portfolio position was imported from.

Revision ID: 0010_position_source_account
Revises: 0009_dividend_agent
Create Date: 2026-10-13
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0010_position_source_account"
down_revision: Union[str, None] = "0009_dividend_agent"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # NULL = 직접 입력한 종목, 값이 있으면 해당 계좌(account_key)에서 가져온 종목
    op.execute(
        "ALTER TABLE portfolio_positions ADD COLUMN IF NOT EXISTS source_account VARCHAR(16)"
    )


def downgrade() -> None:
    op.drop_column("portfolio_positions", "source_account")
