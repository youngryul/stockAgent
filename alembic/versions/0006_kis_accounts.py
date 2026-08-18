"""Allow multiple encrypted KIS keys, one per account number.

Revision ID: 0006_kis_accounts
Revises: 0005_kis_and_targets
Create Date: 2026-08-18
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0006_kis_accounts"
down_revision: Union[str, None] = "0005_kis_and_targets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE kis_credentials ADD COLUMN IF NOT EXISTS account_key VARCHAR(16) NOT NULL DEFAULT ''")
    op.execute("ALTER TABLE kis_credentials DROP CONSTRAINT IF EXISTS pk_kis_credentials")
    op.execute("ALTER TABLE kis_credentials DROP CONSTRAINT IF EXISTS kis_credentials_pkey")
    op.execute(
        "ALTER TABLE kis_credentials ADD CONSTRAINT kis_credentials_pkey PRIMARY KEY (user_id, account_key)"
    )


def downgrade() -> None:
    op.drop_constraint("kis_credentials_pkey", "kis_credentials", type_="primary")
    op.create_primary_key("pk_kis_credentials", "kis_credentials", ["user_id"])
    op.drop_column("kis_credentials", "account_key")
