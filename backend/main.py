from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any, Tuple, Literal
from youtube_transcript_api import TranscriptsDisabled
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
import os
import hashlib
from dotenv import load_dotenv
from models import Video, Subtitle, Dictionary, Translation, UserWord, ManualText, SentenceTranslation
from datetime import datetime, timedelta, timezone
from fastapi.middleware.cors import CORSMiddleware

from extractors.transcript_api import method1_youtube_transcript_api
from extractors.yt_dlp import method2_yt_dlp
from translators.pons import method1_pons
from translators.libretranslate import method2_libretranslate
from vtt_parser import extract_subtitles
from utils import extract_video_id
from database import BASE_DIR, get_db, run_migrations
from lemmatizer import load_model, analyze, NOUNS

load_dotenv()  # must run before CORS_ORIGINS is read below


def parse_origins(value: str) -> List[str]:
    return [o.strip() for o in value.split(",") if o.strip()]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    run_migrations()
    load_model()
    yield


app = FastAPI(title="YouTube Subtitle Downloader", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_origins(os.getenv("CORS_ORIGINS", "http://localhost:3000")),
    allow_credentials=False,  # frontend uses no cookies
    allow_methods=["*"],
    allow_headers=["*"],
)


class VideoRequest(BaseModel):
    url: str
    title: Optional[str] = None


class StatusUpdate(BaseModel):
    status: Literal["learning1", "learning2", "learning3", "known", "ignored"]


class SaveContext(BaseModel):
    context_sentence: Optional[str] = None
    text_kind: Optional[Literal["video", "text"]] = None
    text_id: Optional[int] = None


class TitleUpdate(BaseModel):
    title: str


class TextCreate(BaseModel):
    title: Optional[str] = None
    content: str


PONS_API_KEY = os.getenv("PONS_API_KEY")
LIBRETRANSLATE_URL = os.getenv("LIBRETRANSLATE_URL", "http://localhost:5000")
DEFAULT_TRANSLATION_PRIORITY = os.getenv(
    "DEFAULT_TRANSLATION_PRIORITY", "pons,libretranslate"
)

# ─────────────────────────────────────────
# Routes
# ─────────────────────────────────────────
@app.post("/subtitles/german")
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


@app.get("/sentence")
async def translate_sentence(text: str = Query(..., max_length=1000), db: Session = Depends(get_db)):
    sentence = " ".join(text.split())
    if not sentence:
        raise HTTPException(status_code=422, detail="Sentence is empty")
    key = hashlib.sha256(sentence.encode()).hexdigest()
    row = db.query(SentenceTranslation).filter_by(sentence_hash=key).first()
    if not row:
        res = await method2_libretranslate(sentence, LIBRETRANSLATE_URL)
        # failures are not cached: the next click retries
        if not res.get("success"):
            raise HTTPException(status_code=502, detail=res.get("error", "Translation failed"))
        row = SentenceTranslation(sentence_hash=key, sentence=sentence, translation=res["translations"][0])
        db.add(row)
        try:
            db.commit()
        except IntegrityError:
            # a concurrent request for the same sentence saved it first
            db.rollback()
            row = db.query(SentenceTranslation).filter_by(sentence_hash=key).one()
    return {"sentence": sentence, "translation": row.translation}


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
# Word Lookup: Cache → Priority Translation Pipeline
# ─────────────────────────────────────────
NOUN_CLASSES = {"noun", "nomen", "substantiv"}  # PONS (de) and LibreTranslate/legacy (en) values


@app.get("/word/{word}")
async def lookup_word(
    word: str,
    user_id: int,  # unused: lookup never saves; kept for client compat
    priority: Optional[str] = None,
    force: bool = False,
    sentence: Optional[str] = None,
    db: Session = Depends(get_db),
):
    clicked = word.strip()
    # translations, cache and saves all key on the base form
    # key rule: nouns keep their capital (Bank != bank), every other word is lowercase
    word, pos, article = analyze(clicked, sentence)
    if pos not in NOUNS:
        word = word.lower()
    now = datetime.now(timezone.utc)
    priority_order = parse_priority(priority)

    entry = db.query(Dictionary).filter(Dictionary.german_word == word).first()
    if not entry and pos in NOUNS:
        # legacy rows are all lowercase; a noun adopts its lowercase row (cache and saves follow) instead of starting over
        # only a row that already reads as a noun; a saved verb (gehen) must keep its key
        legacy = db.query(Dictionary).filter(Dictionary.german_word == word.lower()).first()
        if legacy and (legacy.word_class or "").lower() in NOUN_CLASSES:
            entry = legacy
            entry.german_word = word
    cached = {t.source: t for t in entry.translations} if entry else {}
    preferred = priority_order[0]
    errors: Dict[str, str] = {}
    fetched = None
    marker = cached.get(preferred)
    # a failed source is stored as an empty-meanings marker and retried at most once a day
    retry_preferred = marker is None or (
        not marker.meanings
        and marker.updated_at.replace(tzinfo=None)
        < now.replace(tzinfo=None) - timedelta(hours=24)
    )

    if force:
        # re-fetch only the preferred provider; never fall back, never touch other rows
        fetched = await get_translator_providers()[preferred](word)
        if not fetched.get("success"):
            raise HTTPException(
                status_code=502,
                detail=f"{preferred.upper()} failed for '{word}': {fetched.get('error', 'unknown error')}",
            )
    elif retry_preferred:
        fetched, errors = await execute_translation_pipeline(word, priority_order)

    def upsert(src):
        nonlocal entry
        if not entry:
            entry = Dictionary(german_word=word, lookup_count=0)
            db.add(entry)
        if src not in cached:
            cached[src] = Translation(source=src, meanings=[])
            entry.translations.append(cached[src])
        cached[src].updated_at = now
        return cached[src]

    if fetched:
        row = upsert(fetched["source"])
        row.meanings = fetched["translations"]
        row.word_class = fetched.get("word_class")
        row.raw_response = fetched.get("raw_response")
        # mirror for legacy readers
        entry.english_meanings = row.meanings
        entry.word_class = row.word_class
        entry.source = row.source
        entry.raw_response = row.raw_response

    # shortcut: no marker for a word nobody has a translation for (legacy columns are NOT NULL), so unknown words refetch per click
    for src in errors:
        if entry and not (cached.get(src) and cached[src].meanings):  # never blank a good row
            upsert(src)

    found = {s: t for s, t in cached.items() if t.meanings}
    if not found:
        err_details = ". ".join(f"{p.upper()}: {msg}" for p, msg in errors.items())
        raise HTTPException(
            status_code=404,
            detail=f"All translation methods failed for '{word}'. {err_details}".strip(),
        )

    entry.lookup_count = (entry.lookup_count or 0) + 1
    entry.last_lookup_at = now
    db.commit()
    db.refresh(entry)

    shown = next(s for s in [preferred, *priority_order, *found] if s in found)
    res = {
        "id": entry.id,
        "source": shown,
        "word": entry.german_word,
        "clicked": clicked,
        "pos": pos,
        "article": article,
        "english_meanings": found[shown].meanings,
        "word_class": found[shown].word_class,
        "translations": {
            s: {"meanings": t.meanings, "word_class": t.word_class}
            for s, t in found.items()
        },
        "preferred": preferred,
    }
    if errors:
        res["errors"] = errors
    return res


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

    def shown(uw):
        # the saved source's row wins; fall back to the Dictionary mirror
        return next(
            (t for t in uw.word.translations if t.source == uw.source and t.meanings),
            uw.word,
        )

    return [
        {
            "id": uw.id,
            "word": uw.word.german_word,
            "english_meanings": getattr(shown(uw), "meanings", uw.word.english_meanings),
            "word_class": shown(uw).word_class,
            "source": uw.source,
            "is_mastered": uw.is_mastered,
            "review_count": uw.review_count,
            "last_reviewed_at": uw.last_reviewed_at,
            "added_at": uw.added_at,
            "notes": uw.notes,
            "status": uw.status,
            "context_sentence": uw.context_sentence,
            "text_kind": uw.text_kind,
            "text_id": uw.text_id,
        }
        for uw in user_words
    ]


@app.patch("/user-words/{user_word_id}/status")
def set_word_status(user_word_id: int, body: StatusUpdate, db: Session = Depends(get_db)):
    uw = db.query(UserWord).filter(UserWord.id == user_word_id).first()
    if not uw:
        raise HTTPException(status_code=404, detail="Saved word not found")
    uw.status = body.status
    db.commit()
    return {"id": uw.id, "status": uw.status}


@app.post("/user-words/{word_id}/save")
async def save_word(
    word_id: int,
    user_id: int,
    source: Optional[str] = None,
    body: Optional[SaveContext] = None,
    db: Session = Depends(get_db),
):
    ctx = body or SaveContext()
    # Check if word exists in dictionary
    word = db.query(Dictionary).filter(Dictionary.id == word_id).first()
    if not word:
        raise HTTPException(status_code=404, detail="Word not found")

    if source is not None and not any(
        t.source == source and t.meanings for t in word.translations
    ):
        raise HTTPException(status_code=422, detail=f"No '{source}' translation for this word")

    # Check if already saved
    existing = (
        db.query(UserWord)
        .filter(UserWord.user_id == user_id, UserWord.word_id == word_id)
        .first()
    )

    if existing:
        # re-saving from another tab switches the saved meaning to that source
        if source is not None:
            existing.source = source
        # keep the first sentence; only fill it in if none was stored
        if ctx.context_sentence and not existing.context_sentence:
            existing.context_sentence = ctx.context_sentence
            existing.text_kind = ctx.text_kind
            existing.text_id = ctx.text_id
        db.commit()
        return {"message": "Word already in your dictionary", "already_saved": True}

    now = datetime.now(timezone.utc)
    user_word = UserWord(
        user_id=user_id,
        word_id=word_id,
        source=source,
        **ctx.model_dump(),
        last_reviewed_at=now,
        added_at=now,
    )
    db.add(user_word)
    db.commit()
    return {"message": "Word saved successfully", "already_saved": False}


def _text_entry(t: ManualText):
    return {
        "id": t.id,
        "video_id": None,
        "type": "text",
        "source": "manual",
        "title": t.title,
        "language": "de",
        "extraction_method": None,
        "word_count": t.word_count,
        "created_at": t.created_at,
    }


@app.post("/texts")
def create_text(body: TextCreate, db: Session = Depends(get_db)):
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=422, detail="Text must not be empty")
    t = ManualText(
        title=(body.title or "").strip() or "Untitled",
        content=content,
        word_count=len(content.split()),
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return _text_entry(t)


@app.get("/texts/{text_id}")
def get_text(text_id: int, db: Session = Depends(get_db)):
    t = db.get(ManualText, text_id)
    if not t:
        raise HTTPException(status_code=404, detail="Text not found")
    return {"text": t.content}


@app.patch("/texts/{text_id}/title")
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


@app.get("/library")
def get_library(db: Session = Depends(get_db)):
    videos = db.query(Video).all()

    items = []

    for v in videos:
        if not v.subtitles:
            continue

        latest_subtitle = max(v.subtitles, key=lambda s: s.created_at)

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
                "word_count": latest_subtitle.word_count,
                "created_at": latest_subtitle.created_at,
            }
        )

    for t in db.query(ManualText).all():
        items.append(_text_entry(t))

    # sort newest first
    items.sort(key=lambda x: x["created_at"], reverse=True)
    return items


@app.get("/subtitles/{subtitle_id}/text")
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
