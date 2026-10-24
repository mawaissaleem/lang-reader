"""sentence and source text saved with a word

Revision ID: 0007
Revises: 0006
"""
from alembic import op
import sqlalchemy as sa

revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('user_words') as batch_op:
        batch_op.add_column(sa.Column('context_sentence', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('text_kind', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('text_id', sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('user_words') as batch_op:
        batch_op.drop_column('text_id')
        batch_op.drop_column('text_kind')
        batch_op.drop_column('context_sentence')
