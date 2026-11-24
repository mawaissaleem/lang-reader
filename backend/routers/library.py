"""Routes for the library: videos, subtitle text and cues, manual texts (typed, URL or file import) and the combined library list."""

from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session
from webvtt.errors import MalformedCaptionError, MalformedFileError

import entry_actions
import importer
from database import BASE_DIR, get_db
from library_entries import video_entry
from models import ManualText, Subtitle, Video
from vtt_parser import extract_cues

router = APIRouter()


class TitleUpdate(BaseModel):
    title: str


class TextCreate(BaseModel):
    title: Optional[str] = None
    content: str


@router.get("/videos")
def list_videos(db: Session = Depends(get_db)):
    videos = db.query(Video).all()
    return [
        {"id": v.id, "title": v.title, "url": v.url, "created_at": v.created_at}
        for v in videos
    ]


@router.get("/videos/{video_id}/subtitles")
def get_subtitles(video_id: int, db: Session = Depends(get_db)):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return [
        {"id": s.id, "method": s.extraction_method, "txt_path": s.txt_path}
        for s in video.subtitles
    ]


@router.patch("/videos/{video_id}/title")
def update_video_title(video_id: int, body: TitleUpdate, db: Session = Depends(get_db)):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    video.title = body.title.strip()
    db.commit()
    db.refresh(video)
    return {"id": video.id, "title": video.title}


PREVIEW_CHARS = 240  # enough for the first three lines on a library card


def _text_entry(t: ManualText):
    return {
        "id": t.id,
        "video_id": None,
        "type": "text",
        "source": "manual",
        "title": t.title,
        "language": "de",
        "extraction_method": None,
        "caption_source": None,
        "preview": t.content[:PREVIEW_CHARS],
        "word_count": t.word_count,
        "created_at": t.created_at,
    }


def _save_text(db: Session, title: Optional[str], content: str):
    content = content.strip()
    if not content:
        raise HTTPException(status_code=422, detail="Text must not be empty")
    t = ManualText(
        title=(title or "").strip() or "Untitled",
        content=content,
        word_count=len(content.split()),
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _text_entry(t)


@router.post("/texts")
def create_text(body: TextCreate, db: Session = Depends(get_db)):
    return _save_text(db, body.title, body.content)


class UrlImport(BaseModel):
    url: str


@router.post("/texts/import-url")
def import_text_url(body: UrlImport, db: Session = Depends(get_db)):
    try:
        title, text = importer.fetch_url(body.url)
    except importer.ImportError_ as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _save_text(db, title, text)


@router.post("/texts/import-file")
def import_text_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    # shortcut: Starlette spools the whole upload to a temp file before this 20 MB cap applies; upgrade with a request-size limit in a proxy or middleware
    data = file.file.read(importer.MAX_UPLOAD + 1)
    try:
        title, text = importer.read_file(file.filename, data)
    except importer.ImportError_ as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _save_text(db, title or file.filename, text)


@router.get("/texts/{text_id}")
def get_text(text_id: int, db: Session = Depends(get_db)):
    t = db.get(ManualText, text_id)
    if not t:
        raise HTTPException(status_code=404, detail="Text not found")
    return {"text": t.content}


@router.patch("/texts/{text_id}/title")
def update_text_title(text_id: int, body: TitleUpdate, db: Session = Depends(get_db)):
    t = db.get(ManualText, text_id)
    if not t:
        raise HTTPException(status_code=404, detail="Text not found")
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Title must not be empty")
    t.title = title
    db.commit()
    return {"id": t.id, "title": t.title}


@router.post("/library/{kind}/{ref_id}/mark-known")
def mark_entry_known(
    kind: Literal["video", "text"],
    ref_id: int,
    user_id: int = 1,
    db: Session = Depends(get_db),
):
    """Mark every word of a video (by video id) or text known."""
    text = entry_actions.entry_text(db, kind, ref_id)
    if text is None:
        raise HTTPException(status_code=404, detail="Entry or its text not found")
    return {"changed": entry_actions.mark_all_known(db, user_id, text)}


@router.delete("/library/{kind}/{ref_id}")
def delete_library_entry(
    kind: Literal["video", "text"], ref_id: int, db: Session = Depends(get_db)
):
    """Delete a video (by video id) or text from the library."""
    if not entry_actions.delete_entry(db, kind, ref_id):
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"deleted": True}


@router.get("/library")
def get_library(db: Session = Depends(get_db)):
    videos = db.query(Video).all()

    items = []

    for v in videos:
        if not v.subtitles:
            continue

        items.append(video_entry(v))

    for t in db.query(ManualText).all():
        items.append(_text_entry(t))

    # sort newest first
    items.sort(key=lambda x: x["created_at"], reverse=True)
    return items


@router.get("/subtitles/{subtitle_id}/text")
def get_subtitle_text(subtitle_id: int, db: Session = Depends(get_db)):
    subtitle = db.query(Subtitle).filter(Subtitle.id == subtitle_id).first()
    if not subtitle:
        raise HTTPException(status_code=404, detail="Subtitle not found")
    # old rows hold paths relative to backend/; an absolute path wins the join
    txt_path = BASE_DIR / subtitle.txt_path if subtitle.txt_path else None
    if not txt_path or not txt_path.exists():
        raise HTTPException(status_code=404, detail="Text file not found")
    with open(txt_path, "r", encoding="utf-8") as f:
        content = f.read()
    return {"text": content}


@router.get("/subtitles/{subtitle_id}/cues")
def get_subtitle_cues(subtitle_id: int, db: Session = Depends(get_db)):
    """Timed lines re-read from the raw .vtt (old imports too); 404 if it is gone, so the client falls back to plain text."""
    subtitle = db.query(Subtitle).filter(Subtitle.id == subtitle_id).first()
    if not subtitle:
        raise HTTPException(status_code=404, detail="Subtitle not found")
    vtt_path = BASE_DIR / subtitle.vtt_path if subtitle.vtt_path else None
    if not vtt_path or not vtt_path.exists():
        raise HTTPException(status_code=404, detail="Subtitle file not found")
    try:
        cues = extract_cues(str(vtt_path))
    except (OSError, ValueError, MalformedFileError, MalformedCaptionError):
        raise HTTPException(status_code=404, detail="Subtitle file unreadable")
    return {"url": subtitle.video.url, "cues": cues}
