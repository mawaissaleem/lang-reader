"""Routes for learning progress: known words over time, the streak, and per-item known percentages."""

import progress
import history
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from library_entries import latest_subtitle, subtitle_text_path
from models import Dictionary, ManualText, Setting, UserWord, Video

router = APIRouter()


@router.get("/progress")
def get_progress(user_id: int = 1, tz: str = "UTC", db: Session = Depends(get_db)):
    """Known-words-over-time and the daily streak, with days cut in the caller's IANA timezone."""
    try:
        zone = ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(status_code=400, detail=f"Unknown timezone: {tz}")
    return history.build_progress(db, user_id, zone, datetime.now(zone).date())


class GoalBody(BaseModel):
    goal: int = Field(ge=1, le=1000)


@router.put("/progress/goal")
def set_daily_goal(body: GoalBody, db: Session = Depends(get_db)):
    """Store the daily word goal shown on the library and progress pages."""
    db.merge(Setting(key="daily_goal", value=body.goal))
    db.commit()
    return {"goal": body.goal}


@router.get("/library/progress")
def get_library_progress(user_id: int = 1, db: Session = Depends(get_db)):
    """Known/learning/new counts per library item, keyed "<type>-<id>" like the frontend's entryKey."""
    statuses = {
        w: s
        for w, s in db.query(Dictionary.german_word, UserWord.status)
        .join(UserWord, UserWord.word_id == Dictionary.id)
        .filter(UserWord.user_id == user_id)
    }
    out = {}
    for v in db.query(Video).all():
        if not v.subtitles:
            continue
        sub = latest_subtitle(v)
        path = subtitle_text_path(sub)
        if not path:
            continue
        words = progress.cached_words(
            ("video", sub.id),
            path.stat().st_mtime_ns,
            lambda p=path: p.read_text(encoding="utf-8"),
        )
        out[f"video-{sub.id}"] = progress.count_status(words, statuses)
    # shortcut: loads every manual text's content and assumes texts are never edited, so the cache keys on id only; upgrade with an updated_at stamp if editing is added
    for t in db.query(ManualText).all():
        words = progress.cached_words(("text", t.id), None, lambda t=t: t.content)
        out[f"text-{t.id}"] = progress.count_status(words, statuses)
    return out
