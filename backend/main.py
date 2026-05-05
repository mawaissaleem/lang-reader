from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends  # ← added Depends
from pydantic import BaseModel
from youtube_transcript_api import TranscriptsDisabled
from sqlalchemy.orm import Session
import os
import httpx
import os
from fastapi import APIRouter
from dotenv import load_dotenv

from extractors.transcript_api import method1_youtube_transcript_api
from extractors.yt_dlp import method2_yt_dlp
from vtt_parser import extract_subtitles
from utils import extract_video_id
from database import get_db, SessionLocal
from models import Video, Subtitle

app = FastAPI(title="YouTube Subtitle Downloader")


class VideoRequest(BaseModel):
    url: str


load_dotenv()

PONS_API_KEY = os.getenv("PONS_API_KEY")

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
            video = db.query(Video).filter(Video.url == url).first()
            if not video:
                video = Video(url=url, title=title)
                db.add(video)
                db.commit()
                db.refresh(video)

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
def get_german_subtitles(request: VideoRequest, background_tasks: BackgroundTasks):
    url = request.url
    try:
        extract_video_id(url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

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
    title = result.get("title", "Unknown")
    if vtt_path and result.get("status") == "success":
        background_tasks.add_task(
            clean_and_save_subtitle,
            vtt_path,
            url,
            title,
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


def strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text).strip()


@app.get("/dictionary/{word}")
async def get_word_meaning(word: str):
    url = "https://api.pons.com/v1/dictionary"
    params = {"q": word, "l": "deen", "language": "de"}
    headers = {"X-Secret": PONS_API_KEY}

    async with httpx.AsyncClient() as client:
        response = await client.get(url, params=params, headers=headers)

        if response.status_code == 200:
            raw = response.json()
            translations = []

            for hit in raw[0].get("hits", []):
                for rom in hit.get("roms", []):
                    for arab in rom.get("arabs", []):
                        for translation in arab.get("translations", []):
                            german = strip_html(translation["source"])
                            english = strip_html(translation["target"])
                            translations.append({"german": german, "english": english})

            return {"success": True, "word": word, "translations": translations}

        elif response.status_code == 204:
            return {"success": False, "message": f"No results found for '{word}'"}

        elif response.status_code == 403:
            return {"success": False, "message": "Invalid API key"}

        elif response.status_code == 429:
            return {"success": False, "message": "Monthly request limit reached"}

        else:
            return {
                "success": False,
                "message": f"Unexpected error: {response.status_code}",
            }
