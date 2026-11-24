"""Whole-entry actions for the library: read an entry's text, mark all its words known, delete it."""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

import history
import progress
from library_entries import latest_subtitle, subtitle_text_path
from models import Dictionary, ManualText, UserWord, Video


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


def mark_all_known(db: Session, user_id: int, text: str) -> int:
    """Set every word of `text` to known (saving the new ones); ignored words stay ignored. Returns how many changed."""
    forms = progress.unique_words(text)
    # one query each for the dictionary rows and the user's saved words, matched on the form as written or lowercased
    dictionary = {d.german_word: d for d in db.query(Dictionary)}
    saved = {
        uw.word_id: uw for uw in db.query(UserWord).filter(UserWord.user_id == user_id)
    }
    changed = 0
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
                status="known",
                last_reviewed_at=now,
                added_at=now,
            )
            db.add(uw)
            saved[entry.id] = uw
            history.record(db, user_id, entry.id, "known")
            changed += 1
        elif uw.status not in ("known", "ignored"):
            changed += history.set_status(db, uw, "known")
    db.commit()
    return changed


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
