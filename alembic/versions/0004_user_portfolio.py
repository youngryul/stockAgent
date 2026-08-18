"""Scope portfolio rows to a Supabase auth user.

Revision ID: 0004_user_portfolio
Revises: 0003_portfolio_cash
Create Date: 2026-08-18
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004_user_portfolio"
down_revision: Union[str, None] = "0003_portfolio_cash"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_SQL = """
ALTER TABLE portfolio_cash ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portfolio_cash_select ON portfolio_cash;
DROP POLICY IF EXISTS portfolio_cash_insert ON portfolio_cash;
DROP POLICY IF EXISTS portfolio_cash_update ON portfolio_cash;
DROP POLICY IF EXISTS portfolio_positions_select ON portfolio_positions;
DROP POLICY IF EXISTS portfolio_positions_insert ON portfolio_positions;
DROP POLICY IF EXISTS portfolio_positions_update ON portfolio_positions;
DROP POLICY IF EXISTS portfolio_positions_delete ON portfolio_positions;
DROP POLICY IF EXISTS signals_select ON signals;
DROP POLICY IF EXISTS analysis_runs_select ON analysis_runs;

CREATE POLICY portfolio_cash_select ON portfolio_cash
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY portfolio_cash_insert ON portfolio_cash
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY portfolio_cash_update ON portfolio_cash
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY portfolio_positions_select ON portfolio_positions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY portfolio_positions_insert ON portfolio_positions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY portfolio_positions_update ON portfolio_positions
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY portfolio_positions_delete ON portfolio_positions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY signals_select ON signals
  FOR SELECT TO authenticated USING (true);
CREATE POLICY analysis_runs_select ON analysis_runs
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON analysis_runs, signals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON portfolio_cash, portfolio_positions TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE portfolio_positions_id_seq TO authenticated;
"""


def upgrade() -> None:
    op.execute("DELETE FROM portfolio_positions")
    op.execute("DELETE FROM portfolio_cash")

    op.drop_constraint("uq_portfolio_symbol", "portfolio_positions", type_="unique")
    op.add_column(
        "portfolio_positions",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
    )
    op.create_index("ix_portfolio_positions_user_id", "portfolio_positions", ["user_id"])
    op.create_unique_constraint(
        "uq_portfolio_user_symbol",
        "portfolio_positions",
        ["user_id", "symbol"],
    )

    op.drop_constraint("portfolio_cash_pkey", "portfolio_cash", type_="primary")
    op.drop_column("portfolio_cash", "id")
    op.add_column(
        "portfolio_cash",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
    )
    op.create_primary_key("pk_portfolio_cash", "portfolio_cash", ["user_id"])

    conn = op.get_bind()
    has_auth = conn.execute(
        sa.text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth')"
        )
    ).scalar()
    if has_auth:
        op.execute(
            "ALTER TABLE portfolio_cash ADD CONSTRAINT fk_portfolio_cash_user "
            "FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE"
        )
        op.execute(
            "ALTER TABLE portfolio_positions ADD CONSTRAINT fk_portfolio_positions_user "
            "FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE"
        )
        op.execute(sa.text(RLS_SQL))


def downgrade() -> None:
    conn = op.get_bind()
    has_auth = conn.execute(
        sa.text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth')"
        )
    ).scalar()
    if has_auth:
        op.execute("ALTER TABLE portfolio_cash DISABLE ROW LEVEL SECURITY")
        op.execute("ALTER TABLE portfolio_positions DISABLE ROW LEVEL SECURITY")
        op.execute("ALTER TABLE signals DISABLE ROW LEVEL SECURITY")
        op.execute("ALTER TABLE analysis_runs DISABLE ROW LEVEL SECURITY")
        op.execute("ALTER TABLE watchlist DISABLE ROW LEVEL SECURITY")
        op.execute("ALTER TABLE portfolio_cash DROP CONSTRAINT IF EXISTS fk_portfolio_cash_user")
        op.execute(
            "ALTER TABLE portfolio_positions DROP CONSTRAINT IF EXISTS fk_portfolio_positions_user"
        )

    op.execute("DELETE FROM portfolio_cash")
    op.drop_constraint("pk_portfolio_cash", "portfolio_cash", type_="primary")
    op.drop_column("portfolio_cash", "user_id")
    op.add_column(
        "portfolio_cash",
        sa.Column("id", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_primary_key("portfolio_cash_pkey", "portfolio_cash", ["id"])
    op.alter_column("portfolio_cash", "id", server_default=None)

    op.drop_constraint("uq_portfolio_user_symbol", "portfolio_positions", type_="unique")
    op.drop_index("ix_portfolio_positions_user_id", table_name="portfolio_positions")
    op.drop_column("portfolio_positions", "user_id")
    op.create_unique_constraint("uq_portfolio_symbol", "portfolio_positions", ["symbol"])
    op.execute("INSERT INTO portfolio_cash (id, cash_amount) VALUES (1, 0)")
