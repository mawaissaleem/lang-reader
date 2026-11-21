"""Routes for Anki: connection status, setup, the send outbox, sentence cards, pulling intervals, deck import and .apkg export."""

import os
import tempfile
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from anki import (
    get_version,
    list_decks,
    list_note_types,
    note_type_fields,
    ensure_setup as anki_ensure_setup,
    send_pending,
    import_known,
    pull_intervals,
    export_apkg,
    get_mapping,
    pending_count,
    AnkiError,
)
from database import get_db
from models import SentenceCard, Setting

router = APIRouter()


@router.get("/anki/status")
async def anki_status():
    try:
        return {"connected": True, "version": await get_version()}
    except AnkiError:
        return {"connected": False, "version": None}


@router.post("/anki/setup")
async def anki_setup():
    try:
        return await anki_ensure_setup()
    except AnkiError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/anki/pending")
def anki_pending(db: Session = Depends(get_db)):
    return {"pending": pending_count(db)}


class SentenceCardIn(BaseModel):
    sentence_de: str = Field(min_length=1)
    sentence_en: str = Field(min_length=1)
    target_word: str = Field(min_length=1)
    source: str = Field(min_length=1)
    bold: list[str] = Field(
        default=[], max_length=20
    )  # clicked surface forms; empty bolds the lemma


@router.post("/anki/sentences")
async def anki_add_sentence(
    body: SentenceCardIn, user_id: int, db: Session = Depends(get_db)
):
    """Queue a Reader Sentence note (one per user + sentence + word) and try to send it now."""
    sc = (
        db.query(SentenceCard)
        .filter_by(
            user_id=user_id, sentence_de=body.sentence_de, target_word=body.target_word
        )
        .first()
    )
    if not sc:
        sc = SentenceCard(user_id=user_id, **body.model_dump())
        db.add(sc)
    elif sc.anki_status == "failed":
        sc.anki_status = "pending"  # clicking again retries
    db.commit()
    if sc.anki_status == "pending":
        try:
            await send_pending(db)
        except AnkiError:
            pass  # stays pending until Anki is open
        db.refresh(sc)
    return {"anki_status": sc.anki_status, "pending": pending_count(db)}


@router.post("/anki/sync")
async def anki_sync(db: Session = Depends(get_db)):
    try:
        return await send_pending(db)
    except AnkiError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/anki/pull")
async def anki_pull(user_id: int, db: Session = Depends(get_db)):
    """Promote word statuses from the Reader Word cards' Anki intervals."""
    try:
        return await pull_intervals(db, user_id)
    except AnkiError as e:
        raise HTTPException(status_code=502, detail=str(e))


class AnkiMapping(BaseModel):
    decks: List[str]
    model: str
    field: str


@router.get("/anki/overview")
async def anki_overview(db: Session = Depends(get_db)):
    """Decks, note types and the saved mapping, for the settings screen."""
    try:
        return {
            "decks": await list_decks(),
            "models": await list_note_types(),
            "mapping": get_mapping(db),
        }
    except AnkiError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/anki/fields")
async def anki_fields(model: str):
    try:
        return await note_type_fields(model)
    except AnkiError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/anki/import")
async def anki_import(body: AnkiMapping, user_id: int, db: Session = Depends(get_db)):
    """Save the mapping and import its words as known. Read-only on Anki."""
    if not body.decks:
        raise HTTPException(status_code=422, detail="Pick at least one deck")
    mapping = body.model_dump()
    try:
        result = await import_known(db, user_id, mapping)
    except AnkiError as e:
        raise HTTPException(status_code=502, detail=str(e))
    db.merge(Setting(key="anki_mapping", value=mapping))
    db.commit()
    return result


@router.get("/anki/export.apkg")
def anki_export(user_id: int, db: Session = Depends(get_db)):
    """Fallback for no desktop Anki: the user's Anki-bound words as a deck to import by hand."""
    fd, path = tempfile.mkstemp(suffix=".apkg")
    os.close(fd)
    export_apkg(db, user_id, path)
    return FileResponse(
        path,
        media_type="application/octet-stream",
        filename="lang-reader.apkg",
        background=BackgroundTask(os.remove, path),
    )
