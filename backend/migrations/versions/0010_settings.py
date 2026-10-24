"""settings key/value table

Revision ID: 0010
Revises: 0009
"""
from alembic import op
import sqlalchemy as sa

revision = '0010'
down_revision = '0009'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'settings',
        sa.Column('key', sa.String(), primary_key=True),
        sa.Column('value', sa.JSON(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('settings')
