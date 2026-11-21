"""Importing a YouTube video's German subtitles: URL checks, the extraction fallback chain, and saving the result."""

import os
from typing import Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session
from youtube_transcript_api import TranscriptsDisabled

from database import BASE_DIR
from extractors.transcript_api import method1_youtube_transcript_api
from extractors.yt_dlp import method2_yt_dlp
from models import Subtitle, Video
from utils import extract_video_id
from vtt_parser import extract_subtitles


def normalize_video_url(url: str) -> str:
    """Canonical watch URL for any supported YouTube link; 400 if no video id can be found."""
    try:
        video_id = extract_video_id(url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return f"https://www.youtube.com/watch?v={video_id}"


def ensure_not_in_library(db: Session, normalized_url: str) -> None:
    """409 if this video was already imported."""
    existing_video = db.query(Video).filter(Video.url == normalized_url).first()
    if existing_video:
        raise HTTPException(
            status_code=409,
            detail=(
                f"This video already exists in your library: "
                f"{existing_video.title or 'Untitled'}"
            ),
        )


def fetch_subtitles(url: str) -> Tuple[dict, str]:
    """Download German subtitles; returns (extractor result, extraction method name)."""
    # The transcript API is fast but misses some videos, so any failure other than
    # "subtitles disabled" falls through to yt_dlp, which downloads the .vtt itself.
    result = None
    try:
        result = method1_youtube_transcript_api(url)
    except TranscriptsDisabled:
        raise HTTPException(
            status_code=400, detail="Subtitles are disabled for this video."
        )
    except Exception as e:
        print(f"[Method 1 failed] {type(e).__name__}: {e} — falling back to yt_dlp")

    if result is not None and result.get("status") == "success":
        return result, "transcript_api"

    # method 1 may return status "not_found" instead of raising
    languages = (result or {}).get("available_languages")
    try:
        result = method2_yt_dlp(url)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Both methods failed. Last error (yt_dlp): {str(e)}",
        )
    if result.get("status") != "success":
        languages = languages or result.get("available_languages")
        raise HTTPException(status_code=404, detail=_not_found_detail(languages))
    return result, "yt_dlp"


def _not_found_detail(languages: Optional[list]) -> str:
    """The 404 message, listing the languages the video does offer when known."""
    detail = "No German subtitles found for this video."
    if languages:
        codes = [l["code"] if isinstance(l, dict) else l for l in languages]
        detail += f" Available languages: {', '.join(codes)}"
    return detail


def save_subtitles(
    db: Session,
    normalized_url: str,
    title: Optional[str],
    result: dict,
    extraction_method: str,
) -> Video:
    """Clean the .vtt to text and write the txt file, Video and Subtitle rows together.

    On any failure the DB is rolled back so no half-imported video appears in the library.
    """
    vtt_path = result.get("vtt_path")
    final_title = title or result.get("title") or "Unknown"
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
    return video
