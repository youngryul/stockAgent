"""Record how each analysis run was triggered and the scheduler's live status.

Revision ID: 0011_schedule_log
Revises: 0010_position_source_account
Create Date: 2026-10-13
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011_schedule_log"
down_revision: Union[str, None] = "0010_position_source_account"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CREATE_SQL = """
ALTER TABLE analysis_runs ADD COLUMN IF NOT EXISTS triggered_by VARCHAR(16);

CREATE TABLE IF NOT EXISTS scheduler_status (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    started_at TIMESTAMPTZ,
    heartbeat_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    interval_minutes INTEGER,
    schedule_mode VARCHAR(16)
);
"""

RLS_SQL = """
ALTER TABLE scheduler_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scheduler_status_select ON scheduler_status;
CREATE POLICY scheduler_status_select ON scheduler_status
  FOR SELECT TO authenticated USING (true);
GRANT SELECT ON scheduler_status TO authenticated;
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
    op.execute("DROP TABLE IF EXISTS scheduler_status")
    op.drop_column("analysis_runs", "triggered_by")
