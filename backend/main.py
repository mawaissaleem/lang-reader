from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.responses import FileResponse, StreamingResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Tuple, Literal
from youtube_transcript_api import TranscriptsDisabled
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
import asyncio
import logging
import os
import hashlib
import json
import tempfile
from dotenv import load_dotenv
from models import Video, Subtitle, Dictionary, Translation, UserWord, ManualText, SentenceTranslation, Setting, LLMAnswer, SentenceCard
from datetime import datetime, timedelta, timezone
from fastapi.middleware.cors import CORSMiddleware

from extractors.transcript_api import method1_youtube_transcript_api
from extractors.yt_dlp import method2_yt_dlp
from translators.pons import method1_pons
from translators.libretranslate import method2_libretranslate
from translators import llm
from vtt_parser import extract_subtitles
from utils import extract_video_id
from anki import invoke as anki_invoke, ensure_setup as anki_ensure_setup, send_pending, import_known, export_apkg, get_mapping, pending_count, AnkiError
from database import BASE_DIR, SessionLocal, get_db, run_migrations
from lemmatizer import load_model, analyze, NOUNS
import tts

load_dotenv()  # must run before CORS_ORIGINS is read below


def parse_origins(value: str) -> List[str]:
    return [o.strip() for o in value.split(",") if o.strip()]


async def _send_pending_on_start():
    db = SessionLocal()
    try:
        await send_pending(db)
    except Exception as e:  # Anki closed is the normal case
        logging.info("Startup Anki sync skipped: %s", e)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    run_migrations()
    load_model()
    task = asyncio.create_task(_send_pending_on_start())  # background: a closed Anki must not delay startup
    yield
    task.cancel()


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
@app.get("/anki/status")
async def anki_status():
    try:
        return {"connected": True, "version": await anki_invoke("version")}
    except AnkiError:
        return {"connected": False, "version": None}


@app.post("/anki/setup")
async def anki_setup():
    try:
        return await anki_ensure_setup()
    except AnkiError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/anki/pending")
def anki_pending(db: Session = Depends(get_db)):
    return {"pending": pending_count(db)}


class SentenceCardIn(BaseModel):
    sentence_de: str = Field(min_length=1)
    sentence_en: str = Field(min_length=1)
    target_word: str = Field(min_length=1)
    source: str = Field(min_length=1)
    bold: list[str] = Field(default=[], max_length=20)  # clicked surface forms; empty bolds the lemma


@app.post("/anki/sentences")
async def anki_add_sentence(body: SentenceCardIn, user_id: int, db: Session = Depends(get_db)):
    """Queue a Reader Sentence note (one per user + sentence + word) and try to send it now."""
    sc = db.query(SentenceCard).filter_by(user_id=user_id, sentence_de=body.sentence_de, target_word=body.target_word).first()
    if not sc:
        sc = SentenceCard(user_id=user_id, **body.model_dump())
        db.add(sc)
    elif sc.anki_status == "failed":
        sc.anki_status = "pending"  # clicking again retries
    db.commit()
    if sc.anki_status == "pending":
        try:
            await send_pending(db)
        except AnkiError:
            pass  # stays pending until Anki is open
        db.refresh(sc)
    return {"anki_status": sc.anki_status, "pending": pending_count(db)}


@app.post("/anki/sync")
async def anki_sync(db: Session = Depends(get_db)):
    try:
        return await send_pending(db)
    except AnkiError as e:
        raise HTTPException(status_code=502, detail=str(e))


class AnkiMapping(BaseModel):
    decks: List[str]
    model: str
    field: str


@app.get("/anki/overview")
async def anki_overview(db: Session = Depends(get_db)):
    """Decks, note types and the saved mapping, for the settings screen."""
    try:
        return {"decks": await anki_invoke("deckNames"), "models": await anki_invoke("modelNames"), "mapping": get_mapping(db)}
    except AnkiError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/anki/fields")
async def anki_fields(model: str):
    try:
        return await anki_invoke("modelFieldNames", modelName=model)
    except AnkiError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/anki/import")
async def anki_import(body: AnkiMapping, user_id: int, db: Session = Depends(get_db)):
    """Save the mapping and import its words as known. Read-only on Anki."""
    if not body.decks:
        raise HTTPException(status_code=422, detail="Pick at least one deck")
    mapping = body.model_dump()
    try:
        result = await import_known(db, user_id, mapping)
    except AnkiError as e:
        raise HTTPException(status_code=502, detail=str(e))
    db.merge(Setting(key="anki_mapping", value=mapping))
    db.commit()
    return result


@app.get("/anki/export.apkg")
def anki_export(user_id: int, db: Session = Depends(get_db)):
    """Fallback for no desktop Anki: the user's Anki-bound words as a deck to import by hand."""
    fd, path = tempfile.mkstemp(suffix=".apkg")
    os.close(fd)
    export_apkg(db, user_id, path)
    return FileResponse(path, media_type="application/octet-stream", filename="lang-reader.apkg", background=BackgroundTask(os.remove, path))


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


@app.get("/word/{word}/ai")
async def word_ai(word: str, sentence: str = Query(..., max_length=1000), db: Session = Depends(get_db)):
    """NDJSON stream, one object per line: {"token": str} progress ({"retry": true} = attempt 1 was invalid, drop the tokens so far), then exactly one of
    {"result": {...}, "model": str, "cached": bool} or {"error": str}."""
    sentence = " ".join(sentence.split())
    if not sentence:
        raise HTTPException(status_code=422, detail="Sentence is empty")
    clicked = word.strip()
    lemma, pos, article = analyze(clicked, sentence)
    if pos not in NOUNS:
        lemma = lemma.lower()
    saved = db.get(Setting, "llm_model")
    env = os.getenv("OLLAMA_MODEL")
    models = list(dict.fromkeys(m for m in (saved and saved.value, env) if m))  # saved model, then .env as fallback
    key = hashlib.sha256(sentence.encode()).hexdigest()
    entry = db.query(Dictionary).filter(Dictionary.german_word == lemma).first()
    meanings = [m for t in (entry.translations if entry else []) for m in t.meanings]

    def line(obj):
        return json.dumps(obj, ensure_ascii=False) + "\n"

    async def stream():
        if not models:
            yield line({"error": "No model set: choose one in settings or set OLLAMA_MODEL"})
            return
        for model in models:
            row = db.query(LLMAnswer).filter_by(lemma=lemma, sentence_hash=key, model=model).first()
            if row:
                yield line({"result": row.result, "model": model, "cached": True})
                return
            prompt = llm.build_prompt(clicked, lemma, sentence, meanings)
            try:
                async for kind, val in llm.ask(model, prompt):
                    if kind == "token":
                        yield line({"token": val})
                        continue
                    if kind == "retry":
                        yield line({"retry": True})
                        continue
                    # the app's lemmatizer beats the LLM on base form and article; failures are not cached
                    val["lemma"] = lemma
                    if pos in NOUNS and article:
                        val["article"] = article
                    db.add(LLMAnswer(lemma=lemma, sentence_hash=key, model=model, result=val))
                    try:
                        db.commit()
                    except IntegrityError:  # a concurrent request saved it first
                        db.rollback()
                    yield line({"result": val, "model": model, "cached": False})
                return
            except llm.ModelMissing as e:
                if model == models[-1]:
                    yield line({"error": str(e)})
            except llm.LLMError as e:
                yield line({"error": str(e)})
                return

    return StreamingResponse(stream(), media_type="application/x-ndjson")


class ModelChoice(BaseModel):
    name: Optional[str] = None  # None clears the choice, back to OLLAMA_MODEL


@app.get("/llm/models")
async def llm_models(db: Session = Depends(get_db)):
    try:
        models = await llm.list_models()
    except llm.LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))
    saved = db.get(Setting, "llm_model")
    return {"models": models, "selected": saved.value if saved else None, "default": os.getenv("OLLAMA_MODEL")}


@app.put("/llm/model")
async def set_llm_model(body: ModelChoice, db: Session = Depends(get_db)):
    if body.name is None:
        saved = db.get(Setting, "llm_model")
        if saved:
            db.delete(saved)
            db.commit()
        return {"selected": None}
    try:
        names = [m["name"] for m in await llm.list_models()]
    except llm.LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))
    if body.name not in names:
        raise HTTPException(status_code=422, detail=f"Model '{body.name}' is not installed in Ollama")
    db.merge(Setting(key="llm_model", value=body.name))
    db.commit()
    return {"selected": body.name}


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
    anki: bool = False,
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
        if anki and existing.anki_status in ("none", "failed", "sent"):
            existing.anki_status = "pending"
        db.commit()
        return {"message": "Word already in your dictionary", "already_saved": True, **await _try_send(db, existing, anki)}

    now = datetime.now(timezone.utc)
    user_word = UserWord(
        user_id=user_id,
        word_id=word_id,
        source=source,
        **ctx.model_dump(),
        last_reviewed_at=now,
        added_at=now,
        anki_status="pending" if anki else "none",
    )
    db.add(user_word)
    db.commit()
    return {"message": "Word saved successfully", "already_saved": False, **await _try_send(db, user_word, anki)}


async def _try_send(db: Session, uw: UserWord, anki: bool) -> dict:
    # the word is already saved; Anki being closed just leaves it pending
    if anki and uw.anki_status == "pending":
        try:
            await send_pending(db)
        except AnkiError:
            pass
        db.refresh(uw)
    return {"anki_status": uw.anki_status}


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


@app.get("/tts")
async def text_to_speech(text: str = Query(..., max_length=500)):
    if not tts.normalize(text):
        raise HTTPException(status_code=422, detail="text must not be empty")
    try:
        path = await tts.get_audio(text)
    except tts.TTSError as e:
        raise HTTPException(status_code=503, detail=f"Text-to-speech unavailable: {e}")
    # short max-age: the URL has no voice, so a voice change must reach the browser
    return FileResponse(path, media_type="audio/mpeg", headers={"Cache-Control": "public, max-age=86400"})
