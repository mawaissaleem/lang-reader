"""Whole-entry actions for the library: read an entry's text, mark all its words known, delete it."""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

import history
import progress
from library_entries import latest_subtitle, subtitle_text_path
from models import Dictionary, ManualText, UserWord, Video, WordEvent, WordStatus


def entry_text(db: Session, kind: str, ref_id: int) -> Optional[str]:
    """Full text of a video (by video id) or manual text; None when the entry or its file is missing."""
    if kind == "text":
        t = db.get(ManualText, ref_id)
        return t.content if t else None
    v = db.get(Video, ref_id)
    if not v or not v.subtitles:
        return None
    path = subtitle_text_path(latest_subtitle(v))
    if not path:
        return None
    return path.read_text(encoding="utf-8")


@dataclass
class MarkResult:
    """What a mark-known run did: how many words changed, and the rows it created (so they can be undone)."""

    changed: int = 0
    created_word_ids: list = field(default_factory=list)  # UserWord ids
    event_ids: list = field(default_factory=list)  # WordEvent ids of the created words


def mark_forms_known(
    db: Session, user_id: int, forms, only_new: bool = False
) -> MarkResult:
    """Set each word form to known (saving unsaved ones); ignored and already-known words stay as they are.
    With `only_new`, words the user already saved (learning included) are left alone.
    Does not commit: the caller commits, or rolls back to undo the whole run."""
    # one query each for the dictionary rows and the user's saved words, matched on the form as written or lowercased
    dictionary = {d.german_word: d for d in db.query(Dictionary)}
    saved = {
        uw.word_id: uw for uw in db.query(UserWord).filter(UserWord.user_id == user_id)
    }
    result = MarkResult()
    created = []  # (UserWord, WordEvent) pairs, whose ids exist after the flush below
    # sorted so "Haus" is matched before "haus" every run, not in set (hash) order
    for form in sorted(forms):
        entry = dictionary.get(form) or dictionary.get(form.lower())
        if entry is None:
            # shortcut: a bare dictionary row (no meanings) so the word can be saved; a later lookup fills it in
            entry = Dictionary(german_word=form, english_meanings=[], source="manual")
            db.add(entry)
            db.flush()
            dictionary[form] = entry
        uw = saved.get(entry.id)
        if uw is None:
            now = datetime.now(timezone.utc)
            uw = UserWord(
                user_id=user_id,
                word_id=entry.id,
                status=WordStatus.KNOWN,
                last_reviewed_at=now,
                added_at=now,
            )
            db.add(uw)
            saved[entry.id] = uw
            created.append(
                (uw, history.record(db, user_id, entry.id, WordStatus.KNOWN))
            )
            result.changed += 1
        elif not only_new and uw.status not in (WordStatus.KNOWN, WordStatus.IGNORED):
            result.changed += history.set_status(db, uw, WordStatus.KNOWN)
    db.flush()
    result.created_word_ids = [uw.id for uw, _ in created]
    result.event_ids = [ev.id for _, ev in created]
    return result


def mark_all_known(db: Session, user_id: int, text: str) -> int:
    """Set every word of `text` to known (saving the new ones); ignored words stay ignored. Returns how many changed."""
    result = mark_forms_known(db, user_id, progress.unique_words(text))
    db.commit()
    return result.changed


def mark_new_known(db: Session, user_id: int, words) -> MarkResult:
    """Mark the not-yet-saved words known in one transaction; any failure writes nothing."""
    forms = {w for w in map(progress.clean_word, words) if w}
    try:
        result = mark_forms_known(db, user_id, forms, only_new=True)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return result


def undo_mark_new_known(
    db: Session, user_id: int, word_ids: list, event_ids: list
) -> dict:
    """Remove the saved words (and their history events) a mark_new_known run created, in one transaction.
    Ids alone are not trusted (SQLite reuses them), so a word is removed only while it is still exactly as
    the run left it: known, nothing the user added since, and its only history event is the one the run wrote.
    Returns the ids actually removed."""
    try:
        # bare known words: no meaning source, sentence, text link, notes or Anki card added since
        candidates = (
            db.query(UserWord)
            .filter(
                UserWord.id.in_(word_ids),
                UserWord.user_id == user_id,
                UserWord.status == WordStatus.KNOWN,
                UserWord.source.is_(None),
                UserWord.context_sentence.is_(None),
                UserWord.text_kind.is_(None),
                UserWord.text_id.is_(None),
                UserWord.notes.is_(None),
                UserWord.anki_status == "none",
                UserWord.anki_note_id.is_(None),
            )
            .all()
        )
        events_by_word = {}
        for event in db.query(WordEvent).filter(
            WordEvent.user_id == user_id,
            WordEvent.word_id.in_([uw.word_id for uw in candidates]),
        ):
            events_by_word.setdefault(event.word_id, []).append(event)

        # a second event means the word's status changed after the run, so it is the user's now
        allowed_events = set(event_ids)
        removed_words, removed_events = [], []
        for uw in candidates:
            events = events_by_word.get(uw.word_id, [])
            if len(events) != 1 or events[0].id not in allowed_events:
                continue
            removed_words.append(uw.id)
            removed_events.append(events[0].id)
            db.delete(uw)
            # removed so today's goal and streak are not inflated by an undone action
            db.delete(events[0])
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {
        "removed": len(removed_words),
        "word_ids": removed_words,
        "event_ids": removed_events,
    }


def delete_entry(db: Session, kind: str, ref_id: int) -> bool:
    """Delete a video (with its subtitle rows) or a manual text; False when it does not exist."""
    row = db.get(ManualText if kind == "text" else Video, ref_id)
    if not row:
        return False
    # saved words point at texts by id and videos by subtitle id
    ids = [ref_id] if kind == "text" else [s.id for s in row.subtitles]
    keys = [(kind, i) for i in ids]
    # ids can be reused, so unlink saved words or a new entry's title would end up on their Anki notes
    db.query(UserWord).filter(
        UserWord.text_kind == kind, UserWord.text_id.in_(ids)
    ).update({"text_kind": None, "text_id": None}, synchronize_session=False)
    db.delete(row)
    db.commit()
    # ids can be reused, so drop the cached word sets of the deleted entry
    progress.forget(*keys)
    return True
