"""Routes for word lookup with caching, and for the user's saved words and their statuses."""

from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import dictionary
import history
import saved_words
from anki import AnkiError, send_pending
from database import USER_ID, get_db
from lemmatizer import separable_particle, word_key
from models import Dictionary, UserWord, WordStatus
from translation_pipeline import parse_priority

router = APIRouter()


class StatusUpdate(BaseModel):
    status: WordStatus
    # the clicked form (den for der), remembered for colouring
    form: Optional[str] = None


class SaveContext(BaseModel):
    context_sentence: Optional[str] = None
    text_kind: Optional[Literal["video", "text"]] = None
    text_id: Optional[int] = None
    # the clicked form (den for der), remembered for colouring
    form: Optional[str] = None


# ─────────────────────────────────────────
# Word Lookup: Cache → Priority Translation Pipeline
# ─────────────────────────────────────────
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
    word, pos, article = word_key(clicked, sentence)
    now = datetime.now(timezone.utc)
    priority_order = parse_priority(priority)

    entry = dictionary.find_entry(db, word, pos)
    cached = {t.source: t for t in entry.translations} if entry else {}
    fetched, errors = await dictionary.fetch_missing(
        word, priority_order, force, cached.get(priority_order[0]), now
    )
    entry = dictionary.store_translations(
        db=db,
        entry=entry,
        word=word,
        cached=cached,
        fetched=fetched,
        errors=errors,
        now=now,
    )
    found = dictionary.translations_with_meanings(cached, word, errors)
    dictionary.record_lookup(db, entry, now)
    res = dictionary.lookup_response(
        entry=entry,
        clicked=clicked,
        pos=pos,
        article=article,
        priority_order=priority_order,
        found=found,
        errors=errors,
    )
    # lets the reader select the verb's split-off particle too, so the lookup becomes the merged verb
    particle = separable_particle(clicked, sentence)
    if particle:
        res["particle"], res["particle_skip"] = particle
    return res


def _user_word_json(uw: UserWord) -> dict:
    """One saved word as the client lists it, with the meanings of the source it was saved from."""
    # the saved source's row wins; fall back to the Dictionary mirror
    shown = next(
        (t for t in uw.word.translations if t.source == uw.source and t.meanings),
        uw.word,
    )
    return {
        "id": uw.id,
        "word": uw.word.german_word,
        "english_meanings": getattr(shown, "meanings", uw.word.english_meanings),
        "word_class": shown.word_class,
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
        "forms": uw.forms or [],
    }


@router.get("/user/words")
def get_user_words(mastered_only: bool = False, db: Session = Depends(get_db)):
    query = (
        db.query(UserWord)
        .filter(UserWord.user_id == USER_ID)
        .join(Dictionary, UserWord.word_id == Dictionary.id)
    )

    if mastered_only:
        query = query.filter(UserWord.is_mastered.is_(True))

    user_words = query.order_by(UserWord.added_at.desc()).all()
    return [_user_word_json(uw) for uw in user_words]


@router.patch("/user-words/{user_word_id}/status")
def set_word_status(
    user_word_id: int, body: StatusUpdate, db: Session = Depends(get_db)
):
    uw = db.query(UserWord).filter(UserWord.id == user_word_id).first()
    if not uw:
        raise HTTPException(status_code=404, detail="Saved word not found")
    history.set_status(db, uw, body.status)
    saved_words.add_form(uw, body.form)
    db.commit()
    return {"id": uw.id, "status": uw.status}


@router.post("/user-words/{word_id}/save")
async def save_word(
    word_id: int,
    source: Optional[str] = None,
    anki: bool = False,
    body: Optional[SaveContext] = None,
    db: Session = Depends(get_db),
):
    ctx = (body or SaveContext()).model_dump()
    word = db.query(Dictionary).filter(Dictionary.id == word_id).first()
    if not word:
        raise HTTPException(status_code=404, detail="Word not found")
    saved_words.require_translation(word, source)

    existing = (
        db.query(UserWord)
        .filter(UserWord.user_id == USER_ID, UserWord.word_id == word_id)
        .first()
    )
    if existing:
        saved_words.add_form(existing, ctx.pop("form"))
        saved_words.update_existing(existing, source, ctx, anki)
        db.commit()
        return {
            "message": "Word already in your dictionary",
            "already_saved": True,
            **await _try_send(db, existing, anki),
        }

    user_word = saved_words.create_user_word(db, USER_ID, word_id, source, ctx, anki)
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
