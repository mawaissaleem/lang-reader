"""cache of whole-sentence translations

Revision ID: 0008
Revises: 0007
"""
from alembic import op
import sqlalchemy as sa

revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'sentence_translations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('sentence_hash', sa.String(), nullable=False),
        sa.Column('sentence', sa.Text(), nullable=False),
        sa.Column('translation', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('sentence_hash'),
    )


def downgrade() -> None:
    op.drop_table('sentence_translations')
