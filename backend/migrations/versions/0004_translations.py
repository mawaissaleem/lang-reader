"""one translation per (word, source)

Revision ID: 0004
Revises: 0003
"""

from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "translations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("word_id", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("meanings", sa.JSON(), nullable=False),
        sa.Column("word_class", sa.String(), nullable=True),
        sa.Column("raw_response", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["word_id"], ["dictionary.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("word_id", "source"),
    )
    # JSON columns are stored as text, so a plain SQL copy keeps them verbatim
    op.execute(
        "insert into translations (word_id, source, meanings, word_class, raw_response, created_at, updated_at) "
        "select id, source, english_meanings, word_class, raw_response, created_at, updated_at from dictionary"
    )


def downgrade() -> None:
    op.drop_table("translations")
