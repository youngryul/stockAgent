"""Cost-adjusted outcomes and the learned signal policy (필터·신뢰도 보정·목표/손절 폭).

Revision ID: 0013_signal_policy
Revises: 0012_signal_outcomes
Create Date: 2026-10-13
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013_signal_policy"
down_revision: Union[str, None] = "0012_signal_outcomes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CREATE_SQL = """
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS net_return_pct DOUBLE PRECISION;
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS atr_pct DOUBLE PRECISION;
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS gate_status VARCHAR(16);
ALTER TABLE signal_outcomes ADD COLUMN IF NOT EXISTS calibrated_confidence DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS signal_policy (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    policy JSONB NOT NULL
);
"""

RLS_SQL = """
ALTER TABLE signal_policy ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS signal_policy_select ON signal_policy;
CREATE POLICY signal_policy_select ON signal_policy
  FOR SELECT TO authenticated USING (true);
GRANT SELECT ON signal_policy TO authenticated;
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
    op.execute("DROP TABLE IF EXISTS signal_policy")
    for column in ("calibrated_confidence", "gate_status", "atr_pct", "net_return_pct"):
        op.drop_column("signal_outcomes", column)
