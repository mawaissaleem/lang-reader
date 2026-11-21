"""status-change history for the progress page

Revision ID: 0013
Revises: 0012
"""

from alembic import op
import sqlalchemy as sa

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "word_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("word_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_word_events_user_id", "word_events", ["user_id"])
    # shortcut: known words are dated at added_at even if marked known later, no earlier status log exists; accept the skew, nothing to upgrade from
    # one event per existing word at its added_at; rows without a date stay "before tracking", no faked dates
    op.execute(
        "INSERT INTO word_events (user_id, word_id, status, at) "
        "SELECT user_id, word_id, status, added_at FROM user_words WHERE added_at IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_index("ix_word_events_user_id", table_name="word_events")
    op.drop_table("word_events")
