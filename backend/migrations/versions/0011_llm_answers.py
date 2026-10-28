"""cache of LLM answers per (lemma, sentence, model)

Revision ID: 0011
Revises: 0010
"""
from alembic import op
import sqlalchemy as sa

revision = '0011'
down_revision = '0010'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'llm_answers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('lemma', sa.String(), nullable=False),
        sa.Column('sentence_hash', sa.String(), nullable=False),
        sa.Column('model', sa.String(), nullable=False),
        sa.Column('result', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('lemma', 'sentence_hash', 'model'),
    )


def downgrade() -> None:
    op.drop_table('llm_answers')
