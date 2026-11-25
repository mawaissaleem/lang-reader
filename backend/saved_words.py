"""Saving a looked-up word to the user's list: source check, re-save updates, and new rows."""

from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

import history
from models import Dictionary, UserWord, WordStatus


def require_translation(word: Dictionary, source: Optional[str]) -> None:
    """422 if a source was named but the word has no meanings from it."""
    if source is not None and not any(
        t.source == source and t.meanings for t in word.translations
    ):
        raise HTTPException(
            status_code=422, detail=f"No '{source}' translation for this word"
        )


def add_form(uw: UserWord, form: Optional[str]) -> None:
    """Remember a clicked form of the word (the caller commits); the base form itself is not stored."""
    if form and form != uw.word.german_word and form not in (uw.forms or []):
        # a new list, so SQLAlchemy sees the JSON change
        uw.forms = [*(uw.forms or []), form]


def update_existing(
    existing: UserWord, source: Optional[str], ctx: dict, anki: bool
) -> None:
    """Apply a re-save to an already saved word (the caller commits)."""
    # re-saving from another tab switches the saved meaning to that source
    if source is not None:
        existing.source = source
    # keep the first sentence; only fill it in if none was stored
    if ctx["context_sentence"] and not existing.context_sentence:
        existing.context_sentence = ctx["context_sentence"]
        existing.text_kind = ctx["text_kind"]
        existing.text_id = ctx["text_id"]
    if anki and existing.anki_status in ("none", "failed", "sent"):
        existing.anki_status = "pending"


def create_user_word(
    db: Session,
    user_id: int,
    word_id: int,
    source: Optional[str],
    ctx: dict,
    anki: bool,
) -> UserWord:
    """Add a new saved word and its first history entry, then commit."""
    now = datetime.now(timezone.utc)
    form = ctx.pop("form", None)
    user_word = UserWord(
        user_id=user_id,
        word_id=word_id,
        source=source,
        forms=[form]
        if form and form != db.get(Dictionary, word_id).german_word
        else None,
        **ctx,
        last_reviewed_at=now,
        added_at=now,
        anki_status="pending" if anki else "none",
    )
    db.add(user_word)
    history.record(db, user_id, word_id, user_word.status or WordStatus.LEARNING1)
    db.commit()
    return user_word
