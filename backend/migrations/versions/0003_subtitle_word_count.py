"""store subtitle word_count

Revision ID: 0003
Revises: 0002
"""

from pathlib import Path

from alembic import op
import sqlalchemy as sa

from database import BASE_DIR

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("subtitles") as batch_op:
        batch_op.add_column(
            sa.Column("word_count", sa.Integer(), nullable=False, server_default="0")
        )

    conn = op.get_bind()
    for sid, txt_path in conn.execute(
        sa.text("select id, txt_path from subtitles")
    ).fetchall():
        count = 0
        if txt_path:
            try:
                # relative paths are relative to backend/, not the process cwd
                count = len((BASE_DIR / txt_path).read_text(encoding="utf-8").split())
            except Exception:
                # missing or unreadable txt files just get word_count 0; one bad file must not block the upgrade
                pass
        conn.execute(
            sa.text("update subtitles set word_count = :c where id = :i"),
            {"c": count, "i": sid},
        )


def downgrade() -> None:
    with op.batch_alter_table("subtitles") as batch_op:
        batch_op.drop_column("word_count")
