from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from youtube_transcript_api import TranscriptsDisabled
import os

from extractors.transcript_api import method1_youtube_transcript_api
from extractors.yt_dlp import method2_yt_dlp
from vtt_parser import extract_subtitles
from utils import extract_video_id

app = FastAPI(title="YouTube Subtitle Downloader")


class VideoRequest(BaseModel):
    url: str


# ─────────────────────────────────────────
# Background Task
# ─────────────────────────────────────────


def clean_and_save_subtitle(vtt_path: str):
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

    except Exception as e:
        print(f"[BackgroundTask] Failed to clean {vtt_path}: {type(e).__name__}: {e}")


# ─────────────────────────────────────────
# Route
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
        try:
            result = method2_yt_dlp(url)
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Both methods failed. Last error (yt_dlp): {str(e)}",
            )

    # ── Schedule cleaning in background ──
    vtt_path = result.pop("vtt_path", None)
    if vtt_path and result.get("status") == "success":
        background_tasks.add_task(clean_and_save_subtitle, vtt_path)

    return result


@app.get("/")
def root():
    return {
        "message": "YouTube Subtitle Downloader API is running. POST to /subtitles/german"
    }
