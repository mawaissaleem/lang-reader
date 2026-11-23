"""decode HTML entities in cached PONS meanings

Revision ID: 0014
Revises: 0013
"""

import html
import json

from alembic import op
import sqlalchemy as sa

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None

# (table, meanings column); raw_response keeps the untouched PONS payload
PONS_MEANINGS = (("translations", "meanings"), ("dictionary", "english_meanings"))


def upgrade() -> None:
    # PONS rows were cached before entities like &#39; were decoded; new rows are decoded on fetch,
    # and this runs at startup before any new row is written, so decoding once is safe
    conn = op.get_bind()
    for table, column in PONS_MEANINGS:
        rows = conn.execute(
            sa.text(f"select id, {column} from {table} where source = 'pons'")
        ).fetchall()
        for row_id, stored in rows:
            meanings = json.loads(stored) if stored else None
            if not isinstance(meanings, list):
                continue
            decoded = [html.unescape(m) if isinstance(m, str) else m for m in meanings]
            if decoded == meanings:
                continue
            conn.execute(
                sa.text(f"update {table} set {column} = :m where id = :i"),
                {"m": json.dumps(decoded), "i": row_id},
            )


def downgrade() -> None:
    # no-op: the encoded form was a display bug, and re-encoding could not tell which entities PONS sent
    pass
