"""Routes that import a YouTube video's German subtitles into the library."""

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

import subtitle_import
from database import get_db
from library_entries import video_entry

router = APIRouter()


class VideoRequest(BaseModel):
    url: str
    title: Optional[str] = None


@router.post("/subtitles/german")
def get_german_subtitles(
    request: VideoRequest,
    db: Session = Depends(get_db),
):
    normalized_url = subtitle_import.normalize_video_url(request.url)
    existing = subtitle_import.find_video(db, normalized_url)
    if existing and existing.subtitles:
        # a repeat import opens the saved entry instead of failing or copying it
        return {**video_entry(existing), "duplicate": True}
    if existing:
        # a video row without subtitles has nothing to open; drop it so the URL can be imported again
        db.delete(existing)
        db.commit()
    result, method = subtitle_import.fetch_subtitles(request.url)
    # saved inside the request so the library entry exists when we return
    video, duplicate = subtitle_import.save_subtitles(
        db, normalized_url, request.title, result, method
    )
    entry = video_entry(video)
    return {**entry, "duplicate": True} if duplicate else entry
