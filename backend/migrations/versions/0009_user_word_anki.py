"""anki outbox columns on user_words

Revision ID: 0009
Revises: 0008
"""

from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("user_words") as batch:
        batch.add_column(
            sa.Column("anki_status", sa.String(), nullable=False, server_default="none")
        )
        batch.add_column(sa.Column("anki_note_id", sa.BigInteger(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("user_words") as batch:
        batch.drop_column("anki_note_id")
        batch.drop_column("anki_status")
