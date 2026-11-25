"""App setup: CORS, startup tasks and router registration."""

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import config
from anki import AnkiError, send_pending
from database import SessionLocal, run_migrations
from lemmatizer import load_model
from routers import (
    anki,
    imports,
    library,
    llm,
    progress,
    services,
    settings,
    translation,
    tts,
    words,
)


# root handler so module loggers show their name and INFO lines are kept; uvicorn's own loggers don't propagate here
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


def parse_origins(value: str) -> List[str]:
    return [o.strip() for o in value.split(",") if o.strip()]


async def _send_pending_on_start():
    db = SessionLocal()
    try:
        await send_pending(db)
    except AnkiError as e:  # Anki closed is the normal case
        logger.info("Startup Anki sync skipped: %s", e)
    except Exception:
        # background task nobody awaits: log now instead of leaving the error on the task
        logger.exception("Startup Anki sync failed")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    run_migrations()
    load_model()
    # background: a closed Anki must not delay startup
    task = asyncio.create_task(_send_pending_on_start())
    yield
    task.cancel()


app = FastAPI(title="lang-reader", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_origins(config.cors_origins()),
    allow_credentials=False,  # frontend uses no cookies
    allow_methods=["*"],
    allow_headers=["*"],
)


for module in (
    imports,
    library,
    words,
    translation,
    anki,
    llm,
    tts,
    progress,
    services,
    settings,
):
    app.include_router(module.router)


@app.get("/")
def root():
    return {"message": "lang-reader API is running"}
