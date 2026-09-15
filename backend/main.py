from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends  # ← added Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any, Tuple
from youtube_transcript_api import TranscriptsDisabled
from sqlalchemy.orm import Session
import os
import httpx
import os
from fastapi import APIRouter
from dotenv import load_dotenv
from models import Video, Subtitle, Dictionary, UserWord
from datetime import datetime, timezone
from fastapi.middleware.cors import CORSMiddleware

from extractors.transcript_api import method1_youtube_transcript_api
from extractors.yt_dlp import method2_yt_dlp
from translators.pons import method1_pons
from translators.libretranslate import method2_libretranslate
from vtt_parser import extract_subtitles
from utils import extract_video_id
from database import get_db, SessionLocal
from models import Video, Subtitle

app = FastAPI(title="YouTube Subtitle Downloader")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://192.168.1.18:3000",
        "*",
    ],  # your Next.js dev URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class VideoRequest(BaseModel):
    url: str
    title: Optional[str] = None


class TitleUpdate(BaseModel):
    title: str


load_dotenv()

PONS_API_KEY = os.getenv("PONS_API_KEY")
LIBRETRANSLATE_URL = os.getenv("LIBRETRANSLATE_URL", "http://localhost:5000")
DEFAULT_TRANSLATION_PRIORITY = os.getenv(
    "DEFAULT_TRANSLATION_PRIORITY", "pons,libretranslate"
)

router = APIRouter()

import re


# ─────────────────────────────────────────
# Background Task  ← now accepts db + metadata
# ─────────────────────────────────────────
def clean_and_save_subtitle(
    vtt_path: str,
    url: str,
    title: str,
    extraction_method: str,
):
    try:
        filename = os.path.basename(vtt_path)
        stem = os.path.splitext(filename)[0]
        output_dir = "cleaned_subtitles"
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, f"{stem}.txt")

        cleaned_text = extract_subtitles(vtt_path)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(cleaned_text)

        print(f"[BackgroundTask] Cleaned subtitles saved → {output_path}")

        # ── Save to DB ────────────────────────────────────────
        db = SessionLocal()
        try:
            normalized_url = extract_video_id(url)
            normalized_url = f"https://www.youtube.com/watch?v={normalized_url}"

            video = db.query(Video).filter(Video.url == normalized_url).first()
            if not video:
                video = Video(
                    url=normalized_url, title=title.strip() if title else None
                )
                db.add(video)
                db.commit()
                db.refresh(video)
            else:
                # Never overwrite an existing video title with a later duplicate import.
                if not video.title and title and title.strip():
                    video.title = title.strip()
                    db.add(video)
                    db.commit()
                    db.refresh(video)

                # Prevent duplicate subtitle rows for the same YouTube video.
                existing_subtitle = (
                    db.query(Subtitle).filter(Subtitle.video_id == video.id).first()
                )
                if existing_subtitle:
                    print(
                        f"[BackgroundTask] Skipping duplicate subtitle for existing video_id={video.id}"
                    )
                    return

            subtitle = Subtitle(
                video_id=video.id,
                extraction_method=extraction_method,
                vtt_path=vtt_path,
                txt_path=output_path,
                language="de",
            )
            db.add(subtitle)
            db.commit()
            print(f"[BackgroundTask] Saved to DB → video_id={video.id}")
        finally:
            db.close()
        # ────────────────────────────────────────────────────────

    except Exception as e:
        print(f"[BackgroundTask] Failed: {type(e).__name__}: {e}")


# ─────────────────────────────────────────
# Routes
# ─────────────────────────────────────────
@app.post("/subtitles/german")
def get_german_subtitles(
    request: VideoRequest,
    background_tasks: BackgroundTasks,
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
    if result is None:
        extraction_method = "yt_dlp"
        try:
            result = method2_yt_dlp(url)
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Both methods failed. Last error (yt_dlp): {str(e)}",
            )

    # ── Schedule cleaning + DB save in background ──
    vtt_path = result.pop("vtt_path", None)
    # Prefer user-provided title, fallback to extractor title, then Unknown
    final_title = request.title or result.get("title") or "Unknown"
    if vtt_path and result.get("status") == "success":
        background_tasks.add_task(
            clean_and_save_subtitle,
            vtt_path,
            normalized_url,
            final_title,
            extraction_method,
        )

    return result


@app.get("/")
def root():
    return {
        "message": "YouTube Subtitle Downloader API is running. POST to /subtitles/german"
    }


# ─────────────────────────────────────────
# Bonus: View saved subtitles
# ─────────────────────────────────────────
@app.get("/videos")
def list_videos(db: Session = Depends(get_db)):
    videos = db.query(Video).all()
    return [
        {"id": v.id, "title": v.title, "url": v.url, "created_at": v.created_at}
        for v in videos
    ]


@app.get("/videos/{video_id}/subtitles")
def get_subtitles(video_id: int, db: Session = Depends(get_db)):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return [
        {"id": s.id, "method": s.extraction_method, "txt_path": s.txt_path}
        for s in video.subtitles
    ]


@app.patch("/videos/{video_id}/title")
def update_video_title(video_id: int, body: TitleUpdate, db: Session = Depends(get_db)):
    video = db.query(Video).filter(Video.id == video_id).first()
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    video.title = body.title.strip()
    db.commit()
    db.refresh(video)
    return {"id": video.id, "title": video.title}


def strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text).strip()


def get_translator_providers():
    return {
        "pons": lambda word: method1_pons(word, PONS_API_KEY),
        "libretranslate": lambda word: method2_libretranslate(word, LIBRETRANSLATE_URL),
    }


def parse_priority(priority_str: Optional[str]) -> List[str]:
    raw = priority_str or DEFAULT_TRANSLATION_PRIORITY or "pons,libretranslate"
    providers = [p.strip().lower() for p in raw.split(",") if p.strip()]
    valid = ["pons", "libretranslate"]
    result = [p for p in providers if p in valid]
    for v in valid:
        if v not in result:
            result.append(v)
    return result


async def execute_translation_pipeline(
    word: str, priority_order: List[str]
) -> Tuple[Optional[Dict[str, Any]], Dict[str, str]]:
    providers = get_translator_providers()
    errors = {}
    for provider_name in priority_order:
        provider_func = providers.get(provider_name)
        if not provider_func:
            continue
        res = await provider_func(word)
        if res.get("success"):
            return res, errors
        err = res.get("error", f"{provider_name} failed")
        errors[provider_name] = err
        print(f"[{provider_name} failed] {err} — trying next in priority list")
    return None, errors


@app.get("/dictionary/{word}")
async def get_word_meaning(word: str, priority: Optional[str] = None):
    word = word.strip().lower()
    priority_order = parse_priority(priority)

    translation_result, errors = await execute_translation_pipeline(
        word, priority_order
    )
    if translation_result:
        return {
            "success": True,
            "word": word,
            "source": translation_result["source"],
            "translations": [
                {"german": word, "english": t}
                for t in translation_result["translations"]
            ],
            "word_class": translation_result.get("word_class"),
        }

    err_details = ". ".join(f"{p.upper()}: {msg}" for p, msg in errors.items())
    return {
        "success": False,
        "word": word,
        "message": f"All translation methods failed. {err_details}",
    }


# ─────────────────────────────────────────
# Word Lookup: Cache → Priority Translation Pipeline → UserWord
# ─────────────────────────────────────────
@app.get("/word/{word}")
async def lookup_word(
    word: str,
    user_id: int,
    priority: Optional[str] = None,
    force: bool = False,
    db: Session = Depends(get_db),
):
    word = word.strip().lower()
    now = datetime.now(timezone.utc)
    priority_order = parse_priority(priority)

    # ── Step 1: Check Dictionary cache (unless force=True) ──────
    cached = db.query(Dictionary).filter(Dictionary.german_word == word).first()
    if cached and not force:
        cached.lookup_count += 1
        cached.last_lookup_at = now
        db.commit()
        db.refresh(cached)

        _ensure_user_word(db, user_id, cached.id, now)

        return {
            "id": cached.id,
            "source": "cache",
            "word": cached.german_word,
            "english_meanings": cached.english_meanings,
            "word_class": cached.word_class,
        }

    # ── Step 2: Execute priority translation pipeline ───────────
    translation_result, errors = await execute_translation_pipeline(
        word, priority_order
    )
    if not translation_result:
        err_details = ". ".join(f"{p.upper()}: {msg}" for p, msg in errors.items())
        raise HTTPException(
            status_code=404,
            detail=f"All translation methods failed for '{word}'. {err_details}",
        )

    # ── Step 3: Save or Update Dictionary Cache ─────────────────
    if cached:
        cached.english_meanings = translation_result["translations"]
        cached.word_class = translation_result.get("word_class")
        cached.source = translation_result["source"]
        cached.raw_response = translation_result.get("raw_response")
        cached.last_lookup_at = now
        db.commit()
        db.refresh(cached)
        entry = cached
    else:
        new_entry = Dictionary(
            german_word=word,
            english_meanings=translation_result["translations"],
            word_class=translation_result.get("word_class"),
            source=translation_result["source"],
            raw_response=translation_result.get("raw_response"),
            lookup_count=1,
            last_lookup_at=now,
        )
        db.add(new_entry)
        db.commit()
        db.refresh(new_entry)
        entry = new_entry

    # ── Step 4: Save to UserWord ─────────────────────────────────
    _ensure_user_word(db, user_id, entry.id, now)

    return {
        "id": entry.id,
        "source": translation_result["source"],
        "word": entry.german_word,
        "english_meanings": entry.english_meanings,
        "word_class": entry.word_class,
    }


def _ensure_user_word(db: Session, user_id: int, word_id: int, now: datetime):
    """Create UserWord entry if it doesn't exist, else bump review count."""
    existing = (
        db.query(UserWord)
        .filter(UserWord.user_id == user_id, UserWord.word_id == word_id)
        .first()
    )
    if existing:
        existing.review_count += 1
        existing.last_reviewed_at = now
    else:
        db.add(UserWord(user_id=user_id, word_id=word_id, last_reviewed_at=now))
    db.commit()


@app.get("/user/{user_id}/words")
def get_user_words(
    user_id: int, mastered_only: bool = False, db: Session = Depends(get_db)
):
    query = (
        db.query(UserWord)
        .filter(UserWord.user_id == user_id)
        .join(Dictionary, UserWord.word_id == Dictionary.id)
    )

    if mastered_only:
        query = query.filter(UserWord.is_mastered == True)

    user_words = query.order_by(UserWord.added_at.desc()).all()

    return [
        {
            "id": uw.id,
            "word": uw.word.german_word,
            "english_meanings": uw.word.english_meanings,
            "word_class": uw.word.word_class,
            "is_mastered": uw.is_mastered,
            "review_count": uw.review_count,
            "last_reviewed_at": uw.last_reviewed_at,
            "added_at": uw.added_at,
            "notes": uw.notes,
        }
        for uw in user_words
    ]


@app.post("/user-words/{word_id}/save")
async def save_word(word_id: int, user_id: int, db: Session = Depends(get_db)):
    # Check if word exists in dictionary
    word = db.query(Dictionary).filter(Dictionary.id == word_id).first()
    if not word:
        raise HTTPException(status_code=404, detail="Word not found")

    # Check if already saved
    existing = (
        db.query(UserWord)
        .filter(UserWord.user_id == user_id, UserWord.word_id == word_id)
        .first()
    )

    if existing:
        return {"message": "Word already in your dictionary", "already_saved": True}

    now = datetime.now(timezone.utc)
    user_word = UserWord(
        user_id=user_id,
        word_id=word_id,
        last_reviewed_at=now,
        added_at=now,
    )
    db.add(user_word)
    db.commit()
    return {"message": "Word saved successfully", "already_saved": False}


@app.get("/library")
def get_library(db: Session = Depends(get_db)):
    videos = db.query(Video).all()

    items = []

    for v in videos:
        if not v.subtitles:
            continue

        latest_subtitle = max(v.subtitles, key=lambda s: s.created_at)

        word_count = 0
        if latest_subtitle.txt_path and os.path.exists(latest_subtitle.txt_path):
            try:
                with open(latest_subtitle.txt_path, "r", encoding="utf-8") as f:
                    word_count = len(f.read().split())
            except Exception:
                pass

        items.append(
            {
                "id": latest_subtitle.id,
                "video_id": v.id,
                "type": "video",
                "source": "youtube",
                "title": v.title or "Untitled",
                "url": v.url,
                "language": latest_subtitle.language,
                "extraction_method": latest_subtitle.extraction_method,
                "word_count": word_count,
                "created_at": latest_subtitle.created_at,
            }
        )

    # sort newest first
    items.sort(key=lambda x: x["created_at"], reverse=True)
    return items


@app.get("/subtitles/{subtitle_id}/text")
def get_subtitle_text(subtitle_id: int, db: Session = Depends(get_db)):
    subtitle = db.query(Subtitle).filter(Subtitle.id == subtitle_id).first()
    if not subtitle:
        raise HTTPException(status_code=404, detail="Subtitle not found")
    if not subtitle.txt_path or not os.path.exists(subtitle.txt_path):
        raise HTTPException(status_code=404, detail="Text file not found")
    with open(subtitle.txt_path, "r", encoding="utf-8") as f:
        content = f.read()
    return {"text": content}
