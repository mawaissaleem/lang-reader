"""store whether a subtitle is creator-made or auto-generated

Revision ID: 0015
Revises: 0014
"""

from alembic import op
import sqlalchemy as sa

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # nullable: rows imported before this column existed stay NULL (= unknown)
    with op.batch_alter_table("subtitles") as batch:
        batch.add_column(sa.Column("subtitle_type", sa.String(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("subtitles") as batch:
        batch.drop_column("subtitle_type")
