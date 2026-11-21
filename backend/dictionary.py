"""Word lookup service: cached dictionary entries, translation fetching with a daily retry, and the lookup response."""

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from lemmatizer import NOUNS
from models import Dictionary, Translation
from translation_pipeline import execute_translation_pipeline, get_translator_providers

NOUN_CLASSES = {
    "noun",
    "nomen",
    "substantiv",
}  # PONS (de) and LibreTranslate/legacy (en) values


def find_entry(db: Session, word: str, pos: Optional[str]) -> Optional[Dictionary]:
    """The cached Dictionary row for this key, adopting a legacy lowercase noun row if needed."""
    entry = db.query(Dictionary).filter(Dictionary.german_word == word).first()
    if entry or pos not in NOUNS:
        return entry
    # legacy rows are all lowercase; a noun adopts its lowercase row (cache and saves follow) instead of starting over
    # only a row that already reads as a noun; a saved verb (gehen) must keep its key
    legacy = db.query(Dictionary).filter(Dictionary.german_word == word.lower()).first()
    if legacy and (legacy.word_class or "").lower() in NOUN_CLASSES:
        legacy.german_word = word
        return legacy
    return None


def _should_retry(marker: Optional[Translation], now: datetime) -> bool:
    """True when the preferred source has no row yet, or a failure marker older than a day."""
    if marker is None:
        return True
    # a failed source is stored as an empty-meanings marker and retried at most once a day
    cutoff = now.replace(tzinfo=None) - timedelta(hours=24)
    return not marker.meanings and marker.updated_at.replace(tzinfo=None) < cutoff


async def fetch_missing(
    word: str,
    priority_order: List[str],
    force: bool,
    marker: Optional[Translation],
    now: datetime,
) -> Tuple[Optional[dict], Dict[str, str]]:
    """Fetch a translation only when needed; returns (fetched or None, {provider: error})."""
    preferred = priority_order[0]
    if force:
        # re-fetch only the preferred provider; never fall back, never touch other rows
        fetched = await get_translator_providers()[preferred](word)
        if not fetched.get("success"):
            raise HTTPException(
                status_code=502,
                detail=f"{preferred.upper()} failed for '{word}': {fetched.get('error', 'unknown error')}",
            )
        return fetched, {}
    if _should_retry(marker, now):
        return await execute_translation_pipeline(word, priority_order)
    return None, {}


def store_translations(
    db: Session,
    entry: Optional[Dictionary],
    word: str,
    cached: Dict[str, Translation],
    fetched: Optional[dict],
    errors: Dict[str, str],
    now: datetime,
) -> Optional[Dictionary]:
    """Write the fetched translation and failure markers into the cache; returns the (possibly new) entry."""

    def upsert(entry, src):
        if not entry:
            entry = Dictionary(german_word=word, lookup_count=0)
            db.add(entry)
        if src not in cached:
            cached[src] = Translation(source=src, meanings=[])
            entry.translations.append(cached[src])
        cached[src].updated_at = now
        return entry, cached[src]

    if fetched:
        entry, row = upsert(entry, fetched["source"])
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
            entry, _ = upsert(entry, src)
    return entry


def translations_with_meanings(
    cached: Dict[str, Translation], word: str, errors: Dict[str, str]
) -> Dict[str, Translation]:
    """The sources that have meanings; 404 listing each provider's error when none do."""
    found = {s: t for s, t in cached.items() if t.meanings}
    if not found:
        err_details = ". ".join(f"{p.upper()}: {msg}" for p, msg in errors.items())
        raise HTTPException(
            status_code=404,
            detail=f"All translation methods failed for '{word}'. {err_details}".strip(),
        )
    return found


def record_lookup(db: Session, entry: Dictionary, now: datetime) -> None:
    """Count this lookup on the entry and commit."""
    entry.lookup_count = (entry.lookup_count or 0) + 1
    entry.last_lookup_at = now
    db.commit()
    db.refresh(entry)


def lookup_response(
    entry: Dictionary,
    clicked: str,
    pos: Optional[str],
    article: Optional[str],
    priority_order: List[str],
    found: Dict[str, Translation],
    errors: Dict[str, str],
) -> dict:
    """The JSON the client shows: the preferred source's meanings plus every other source."""
    preferred = priority_order[0]
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
