"""App setup: environment, CORS, startup tasks and router registration."""

# load_dotenv() must run before the app modules below are imported, because
# anki, database and translators.llm read their settings from the environment at import time.

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import List

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
    task = asyncio.create_task(
        _send_pending_on_start()
    )  # background: a closed Anki must not delay startup
    yield
    task.cancel()


app = FastAPI(title="lang-reader", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_origins(os.getenv("CORS_ORIGINS", "http://localhost:3000")),
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
):
    app.include_router(module.router)


@app.get("/")
def root():
    return {"message": "lang-reader API is running"}
