"""App setup: environment, CORS, startup tasks and router registration."""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import List

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from anki import send_pending
from database import SessionLocal, run_migrations
from lemmatizer import load_model

# must run before the routers are imported: the translation router reads its API keys at import time
load_dotenv()

from routers import (  # noqa: E402
    anki,
    imports,
    library,
    llm,
    progress,
    translation,
    tts,
    words,
)


def parse_origins(value: str) -> List[str]:
    return [o.strip() for o in value.split(",") if o.strip()]


async def _send_pending_on_start():
    db = SessionLocal()
    try:
        await send_pending(db)
    except Exception as e:  # Anki closed is the normal case
        logging.info("Startup Anki sync skipped: %s", e)
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


app = FastAPI(title="YouTube Subtitle Downloader", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_origins(os.getenv("CORS_ORIGINS", "http://localhost:3000")),
    allow_credentials=False,  # frontend uses no cookies
    allow_methods=["*"],
    allow_headers=["*"],
)


for module in (imports, library, words, translation, anki, llm, tts, progress):
    app.include_router(module.router)


@app.get("/")
def root():
    return {
        "message": "YouTube Subtitle Downloader API is running. POST to /subtitles/german"
    }
