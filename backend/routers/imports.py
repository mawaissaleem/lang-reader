"""Routes that import a YouTube video's German subtitles into the library."""

import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from youtube_transcript_api import TranscriptsDisabled

from database import BASE_DIR, get_db
from extractors.transcript_api import method1_youtube_transcript_api
from extractors.yt_dlp import method2_yt_dlp
from models import Subtitle, Video
from utils import extract_video_id
from vtt_parser import extract_subtitles

router = APIRouter()


class VideoRequest(BaseModel):
    url: str
    title: Optional[str] = None


@router.post("/subtitles/german")
def get_german_subtitles(
    request: VideoRequest,
    db: Session = Depends(get_db),
):
    url = request.url
    try:
        video_id = extract_video_id(url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    normalized_url = f"https://www.youtube.com/watch?v={video_id}"
    existing_video = db.query(Video).filter(Video.url == normalized_url).first()
    if existing_video:
        raise HTTPException(
            status_code=409,
            detail=(
                f"This video already exists in your library: "
                f"{existing_video.title or 'Untitled'}"
            ),
        )

    # Fallback chain: the transcript API is fast but misses some videos, so any failure
    # other than "subtitles disabled" falls through to yt_dlp, which downloads the .vtt itself.
    # ── Try Method 1 ──
    result = None
    extraction_method = "transcript_api"
    try:
        result = method1_youtube_transcript_api(url)
    except TranscriptsDisabled:
        raise HTTPException(
            status_code=400, detail="Subtitles are disabled for this video."
        )
    except Exception as e:
        print(f"[Method 1 failed] {type(e).__name__}: {e} — falling back to yt_dlp")

    # ── Fallback: Method 2 ──
    if result is None or result.get("status") != "success":
        # method 1 may return status "not_found" instead of raising
        languages = (result or {}).get("available_languages")
        extraction_method = "yt_dlp"
        try:
            result = method2_yt_dlp(url)
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Both methods failed. Last error (yt_dlp): {str(e)}",
            )
        if result.get("status") != "success":
            languages = languages or result.get("available_languages")
            detail = "No German subtitles found for this video."
            if languages:
                codes = [l["code"] if isinstance(l, dict) else l for l in languages]
                detail += f" Available languages: {', '.join(codes)}"
            raise HTTPException(status_code=404, detail=detail)

    # ── Clean + save inside the request so the entry exists when we return ──
    # The txt file, Video and Subtitle rows are written together; on any failure the DB
    # is rolled back so no half-imported video appears in the library.
    vtt_path = result.get("vtt_path")
    final_title = request.title or result.get("title") or "Unknown"
    try:
        stem = os.path.splitext(os.path.basename(vtt_path))[0]
        os.makedirs(BASE_DIR / "cleaned_subtitles", exist_ok=True)
        txt_path = str(BASE_DIR / "cleaned_subtitles" / f"{stem}.txt")
        cleaned_text = extract_subtitles(vtt_path)
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(cleaned_text)

        video = Video(url=normalized_url, title=final_title.strip())
        db.add(video)
        db.flush()
        subtitle = Subtitle(
            video_id=video.id,
            extraction_method=extraction_method,
            vtt_path=vtt_path,
            txt_path=txt_path,
            language="de",
            word_count=len(cleaned_text.split()),
        )
        db.add(subtitle)
        db.commit()
        db.refresh(subtitle)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process subtitles: {type(e).__name__}: {e}",
        )

    return {
        "id": subtitle.id,
        "video_id": video.id,
        "type": "video",
        "source": "youtube",
        "title": video.title,
        "url": video.url,
        "language": subtitle.language,
        "extraction_method": subtitle.extraction_method,
        "word_count": subtitle.word_count,
        "created_at": subtitle.created_at,
    }
