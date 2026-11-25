"""remember the clicked forms of a saved word so they keep its colour after a reload

Revision ID: 0016
Revises: 0015
"""

from alembic import op
import sqlalchemy as sa

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # nullable: words saved before this column existed have no recorded forms
    with op.batch_alter_table("user_words") as batch:
        batch.add_column(sa.Column("forms", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("user_words") as batch:
        batch.drop_column("forms")
