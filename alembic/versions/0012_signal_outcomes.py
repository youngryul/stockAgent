"""Graded outcomes for short-term BUY/SELL signals (성적표 탭).

Revision ID: 0012_signal_outcomes
Revises: 0011_schedule_log
Create Date: 2026-10-13
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0012_signal_outcomes"
down_revision: Union[str, None] = "0011_schedule_log"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CREATE_SQL = """
CREATE TABLE IF NOT EXISTS signal_outcomes (
    signal_id INTEGER PRIMARY KEY REFERENCES signals (id) ON DELETE CASCADE,
    symbol VARCHAR(32) NOT NULL,
    market VARCHAR(8) NOT NULL,
    horizon VARCHAR(8) NOT NULL,
    action VARCHAR(8) NOT NULL,
    source VARCHAR(16),
    confidence DOUBLE PRECISION NOT NULL,
    signal_at TIMESTAMPTZ NOT NULL,
    base_at TIMESTAMPTZ,
    base_price DOUBLE PRECISION,
    entry_hint DOUBLE PRECISION,
    stop_loss DOUBLE PRECISION,
    take_profit DOUBLE PRECISION,
    entry_touched BOOLEAN,
    result VARCHAR(16) NOT NULL,
    exit_at TIMESTAMPTZ,
    exit_price DOUBLE PRECISION,
    return_pct DOUBLE PRECISION,
    return_1d DOUBLE PRECISION,
    return_2d DOUBLE PRECISION,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_signal_outcomes_signal_at ON signal_outcomes (signal_at);
"""

RLS_SQL = """
ALTER TABLE signal_outcomes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS signal_outcomes_select ON signal_outcomes;
CREATE POLICY signal_outcomes_select ON signal_outcomes
  FOR SELECT TO authenticated USING (true);
GRANT SELECT ON signal_outcomes TO authenticated;
"""


def upgrade() -> None:
    op.execute(sa.text(CREATE_SQL))
    conn = op.get_bind()
    has_auth = conn.execute(
        sa.text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth')"
        )
    ).scalar()
    if has_auth:
        op.execute(sa.text(RLS_SQL))


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS signal_outcomes")
