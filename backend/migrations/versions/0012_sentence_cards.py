"""outbox for Reader Sentence notes

Revision ID: 0012
Revises: 0011
"""
from alembic import op
import sqlalchemy as sa

revision = '0012'
down_revision = '0011'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'sentence_cards',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('sentence_de', sa.Text(), nullable=False),
        sa.Column('sentence_en', sa.Text(), nullable=False),
        sa.Column('target_word', sa.String(), nullable=False),
        sa.Column('bold', sa.JSON(), nullable=False),
        sa.Column('source', sa.String(), nullable=False),
        sa.Column('anki_status', sa.String(), nullable=False),
        sa.Column('anki_note_id', sa.BigInteger(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'sentence_de', 'target_word'),
    )
    op.create_index('ix_sentence_cards_user_id', 'sentence_cards', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_sentence_cards_user_id', table_name='sentence_cards')
    op.drop_table('sentence_cards')
