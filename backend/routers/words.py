"""Routes for word lookup with caching, and for the user's saved words and their statuses."""

from datetime import datetime, timedelta, timezone
from typing import Dict, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import history
from anki import AnkiError, send_pending
from database import get_db
from lemmatizer import NOUNS, analyze
from models import Dictionary, Translation, UserWord
from routers.translation import (
    execute_translation_pipeline,
    get_translator_providers,
    parse_priority,
)

router = APIRouter()


class StatusUpdate(BaseModel):
    status: Literal["learning1", "learning2", "learning3", "known", "ignored"]


class SaveContext(BaseModel):
    context_sentence: Optional[str] = None
    text_kind: Optional[Literal["video", "text"]] = None
    text_id: Optional[int] = None


# ─────────────────────────────────────────
# Word Lookup: Cache → Priority Translation Pipeline
# ─────────────────────────────────────────
NOUN_CLASSES = {
    "noun",
    "nomen",
    "substantiv",
}  # PONS (de) and LibreTranslate/legacy (en) values


@router.get("/word/{word}")
async def lookup_word(
    word: str,
    priority: Optional[str] = None,
    force: bool = False,
    sentence: Optional[str] = None,
    db: Session = Depends(get_db),
):
    clicked = word.strip()
    # translations, cache and saves all key on the base form
    # key rule: nouns keep their capital (Bank != bank), every other word is lowercase
    word, pos, article = analyze(clicked, sentence)
    if pos not in NOUNS:
        word = word.lower()
    now = datetime.now(timezone.utc)
    priority_order = parse_priority(priority)

    entry = db.query(Dictionary).filter(Dictionary.german_word == word).first()
    if not entry and pos in NOUNS:
        # legacy rows are all lowercase; a noun adopts its lowercase row (cache and saves follow) instead of starting over
        # only a row that already reads as a noun; a saved verb (gehen) must keep its key
        legacy = (
            db.query(Dictionary).filter(Dictionary.german_word == word.lower()).first()
        )
        if legacy and (legacy.word_class or "").lower() in NOUN_CLASSES:
            entry = legacy
            entry.german_word = word
    cached = {t.source: t for t in entry.translations} if entry else {}
    preferred = priority_order[0]
    errors: Dict[str, str] = {}
    fetched = None
    marker = cached.get(preferred)
    # a failed source is stored as an empty-meanings marker and retried at most once a day
    retry_preferred = marker is None or (
        not marker.meanings
        and marker.updated_at.replace(tzinfo=None)
        < now.replace(tzinfo=None) - timedelta(hours=24)
    )

    if force:
        # re-fetch only the preferred provider; never fall back, never touch other rows
        fetched = await get_translator_providers()[preferred](word)
        if not fetched.get("success"):
            raise HTTPException(
                status_code=502,
                detail=f"{preferred.upper()} failed for '{word}': {fetched.get('error', 'unknown error')}",
            )
    elif retry_preferred:
        fetched, errors = await execute_translation_pipeline(word, priority_order)

    def upsert(src):
        nonlocal entry
        if not entry:
            entry = Dictionary(german_word=word, lookup_count=0)
            db.add(entry)
        if src not in cached:
            cached[src] = Translation(source=src, meanings=[])
            entry.translations.append(cached[src])
        cached[src].updated_at = now
        return cached[src]

    if fetched:
        row = upsert(fetched["source"])
        row.meanings = fetched["translations"]
        row.word_class = fetched.get("word_class")
        row.raw_response = fetched.get("raw_response")
        # mirror for legacy readers
        entry.english_meanings = row.meanings
        entry.word_class = row.word_class
        entry.source = row.source
        entry.raw_response = row.raw_response

    # shortcut: no marker for a word nobody has a translation for (legacy columns are NOT NULL), so unknown words refetch per click
    for src in errors:
        if entry and not (
            cached.get(src) and cached[src].meanings
        ):  # never blank a good row
            upsert(src)

    found = {s: t for s, t in cached.items() if t.meanings}
    if not found:
        err_details = ". ".join(f"{p.upper()}: {msg}" for p, msg in errors.items())
        raise HTTPException(
            status_code=404,
            detail=f"All translation methods failed for '{word}'. {err_details}".strip(),
        )

    entry.lookup_count = (entry.lookup_count or 0) + 1
    entry.last_lookup_at = now
    db.commit()
    db.refresh(entry)

    shown = next(s for s in [preferred, *priority_order, *found] if s in found)
    res = {
        "id": entry.id,
        "source": shown,
        "word": entry.german_word,
        "clicked": clicked,
        "pos": pos,
        "article": article,
        "english_meanings": found[shown].meanings,
        "word_class": found[shown].word_class,
        "translations": {
            s: {"meanings": t.meanings, "word_class": t.word_class}
            for s, t in found.items()
        },
        "preferred": preferred,
    }
    if errors:
        res["errors"] = errors
    return res


@router.get("/user/{user_id}/words")
def get_user_words(
    user_id: int, mastered_only: bool = False, db: Session = Depends(get_db)
):
    query = (
        db.query(UserWord)
        .filter(UserWord.user_id == user_id)
        .join(Dictionary, UserWord.word_id == Dictionary.id)
    )

    if mastered_only:
        query = query.filter(UserWord.is_mastered == True)

    user_words = query.order_by(UserWord.added_at.desc()).all()

    def shown(uw):
        # the saved source's row wins; fall back to the Dictionary mirror
        return next(
            (t for t in uw.word.translations if t.source == uw.source and t.meanings),
            uw.word,
        )

    return [
        {
            "id": uw.id,
            "word": uw.word.german_word,
            "english_meanings": getattr(
                shown(uw), "meanings", uw.word.english_meanings
            ),
            "word_class": shown(uw).word_class,
            "source": uw.source,
            "is_mastered": uw.is_mastered,
            "review_count": uw.review_count,
            "last_reviewed_at": uw.last_reviewed_at,
            "added_at": uw.added_at,
            "notes": uw.notes,
            "status": uw.status,
            "context_sentence": uw.context_sentence,
            "text_kind": uw.text_kind,
            "text_id": uw.text_id,
        }
        for uw in user_words
    ]


@router.patch("/user-words/{user_word_id}/status")
def set_word_status(
    user_word_id: int, body: StatusUpdate, db: Session = Depends(get_db)
):
    uw = db.query(UserWord).filter(UserWord.id == user_word_id).first()
    if not uw:
        raise HTTPException(status_code=404, detail="Saved word not found")
    history.set_status(db, uw, body.status)
    db.commit()
    return {"id": uw.id, "status": uw.status}


@router.post("/user-words/{word_id}/save")
async def save_word(
    word_id: int,
    user_id: int,
    source: Optional[str] = None,
    anki: bool = False,
    body: Optional[SaveContext] = None,
    db: Session = Depends(get_db),
):
    ctx = body or SaveContext()
    # Check if word exists in dictionary
    word = db.query(Dictionary).filter(Dictionary.id == word_id).first()
    if not word:
        raise HTTPException(status_code=404, detail="Word not found")

    if source is not None and not any(
        t.source == source and t.meanings for t in word.translations
    ):
        raise HTTPException(
            status_code=422, detail=f"No '{source}' translation for this word"
        )

    # Check if already saved
    existing = (
        db.query(UserWord)
        .filter(UserWord.user_id == user_id, UserWord.word_id == word_id)
        .first()
    )

    if existing:
        # re-saving from another tab switches the saved meaning to that source
        if source is not None:
            existing.source = source
        # keep the first sentence; only fill it in if none was stored
        if ctx.context_sentence and not existing.context_sentence:
            existing.context_sentence = ctx.context_sentence
            existing.text_kind = ctx.text_kind
            existing.text_id = ctx.text_id
        if anki and existing.anki_status in ("none", "failed", "sent"):
            existing.anki_status = "pending"
        db.commit()
        return {
            "message": "Word already in your dictionary",
            "already_saved": True,
            **await _try_send(db, existing, anki),
        }

    now = datetime.now(timezone.utc)
    user_word = UserWord(
        user_id=user_id,
        word_id=word_id,
        source=source,
        **ctx.model_dump(),
        last_reviewed_at=now,
        added_at=now,
        anki_status="pending" if anki else "none",
    )
    db.add(user_word)
    history.record(db, user_id, word_id, user_word.status or "learning1")
    db.commit()
    return {
        "message": "Word saved successfully",
        "already_saved": False,
        **await _try_send(db, user_word, anki),
    }


async def _try_send(db: Session, uw: UserWord, anki: bool) -> dict:
    # the word is already saved; Anki being closed just leaves it pending
    if anki and uw.anki_status == "pending":
        try:
            await send_pending(db)
        except AnkiError:
            pass
        db.refresh(uw)
    return {"anki_status": uw.anki_status}
