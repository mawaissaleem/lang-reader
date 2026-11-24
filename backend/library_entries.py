"""Shapes a video into the library entry the client lists, shared by the library, import and progress routes."""

from pathlib import Path
from typing import Optional

from database import BASE_DIR
from models import Subtitle, Video


def latest_subtitle(v: Video):
    """The video's newest subtitle, the one the library lists."""
    return max(v.subtitles, key=lambda s: s.created_at)


def subtitle_text_path(sub: Subtitle) -> Optional[Path]:
    """Path of the subtitle's cleaned .txt file, or None when it has none or the file is gone."""
    if not sub.txt_path:
        return None
    path = BASE_DIR / sub.txt_path
    return path if path.exists() else None


CAPTION_SOURCES = {"manual": "creator", "auto-generated": "auto"}


def video_entry(v: Video):
    """Library entry for a video that has at least one subtitle."""
    sub = latest_subtitle(v)
    return {
        "id": sub.id,
        "video_id": v.id,
        "type": "video",
        "source": "youtube",
        "title": v.title or "Untitled",
        "url": v.url,
        "language": sub.language,
        "extraction_method": sub.extraction_method,
        "caption_source": CAPTION_SOURCES.get(sub.subtitle_type),
        "word_count": sub.word_count,
        "created_at": sub.created_at,
    }
