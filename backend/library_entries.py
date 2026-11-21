"""Shapes a video into the library entry the client lists, shared by the library, import and progress routes."""

from models import Video


def latest_subtitle(v: Video):
    """The video's newest subtitle, the one the library lists."""
    return max(v.subtitles, key=lambda s: s.created_at)


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
        "word_count": sub.word_count,
        "created_at": sub.created_at,
    }
