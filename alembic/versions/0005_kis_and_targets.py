"""Encrypted KIS credentials and per-position stop/take prices.

Revision ID: 0005_kis_and_targets
Revises: 0004_user_portfolio
Create Date: 2026-08-18
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005_kis_and_targets"
down_revision: Union[str, None] = "0004_user_portfolio"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_SQL = """
ALTER TABLE kis_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kis_credentials_select ON kis_credentials;
DROP POLICY IF EXISTS kis_credentials_insert ON kis_credentials;
DROP POLICY IF EXISTS kis_credentials_update ON kis_credentials;
DROP POLICY IF EXISTS kis_credentials_delete ON kis_credentials;

CREATE POLICY kis_credentials_select ON kis_credentials
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY kis_credentials_insert ON kis_credentials
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY kis_credentials_update ON kis_credentials
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY kis_credentials_delete ON kis_credentials
  FOR DELETE TO authenticated USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON kis_credentials TO authenticated;
"""


def upgrade() -> None:
    op.add_column("portfolio_positions", sa.Column("stop_loss", sa.Float(), nullable=True))
    op.add_column("portfolio_positions", sa.Column("take_profit", sa.Float(), nullable=True))
    op.create_table(
        "kis_credentials",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("environment", sa.String(length=8), nullable=False, server_default="real"),
        sa.Column("account_hint", sa.String(length=16), nullable=False, server_default=""),
        sa.Column("ciphertext", sa.Text(), nullable=False),
        sa.Column("nonce", sa.Text(), nullable=False),
        sa.Column("auth_tag", sa.Text(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("user_id", name="pk_kis_credentials"),
    )

    conn = op.get_bind()
    has_auth = conn.execute(
        sa.text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth')"
        )
    ).scalar()
    if has_auth:
        op.execute(
            "ALTER TABLE kis_credentials ADD CONSTRAINT fk_kis_credentials_user "
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
        op.execute("ALTER TABLE kis_credentials DISABLE ROW LEVEL SECURITY")
        op.execute("ALTER TABLE kis_credentials DROP CONSTRAINT IF EXISTS fk_kis_credentials_user")

    op.drop_table("kis_credentials")
    op.drop_column("portfolio_positions", "take_profit")
    op.drop_column("portfolio_positions", "stop_loss")
