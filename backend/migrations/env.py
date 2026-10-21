from alembic import context
from sqlalchemy import create_engine

from database import DATABASE_URL
from models import Base

config = context.config
target_metadata = Base.metadata
# run_migrations() may inject a URL; CLI falls back to database.py's.
url = config.get_main_option("sqlalchemy.url") or DATABASE_URL

if context.is_offline_mode():
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    engine = create_engine(url)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, render_as_batch=True)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()
