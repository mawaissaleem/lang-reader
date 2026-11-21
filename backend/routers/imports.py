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
    subtitle_import.ensure_not_in_library(db, normalized_url)
    result, method = subtitle_import.fetch_subtitles(request.url)
    # saved inside the request so the library entry exists when we return
    video = subtitle_import.save_subtitles(
        db, normalized_url, request.title, result, method
    )
    return video_entry(video)
