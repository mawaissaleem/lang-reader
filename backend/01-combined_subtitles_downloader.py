from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from youtube_transcript_api import (
    YouTubeTranscriptApi,
    NoTranscriptFound,
    TranscriptsDisabled,
)
import yt_dlp
import requests
import os
import re

app = FastAPI(title="YouTube Subtitle Downloader")

COOKIES_PATH = "cookies.txt"


class VideoRequest(BaseModel):
    url: str


# ─────────────────────────────────────────
# Shared helpers
# ─────────────────────────────────────────


def extract_video_id(url: str) -> str:
    patterns = [
        r"v=([a-zA-Z0-9_-]{11})",
        r"youtu\.be/([a-zA-Z0-9_-]{11})",
        r"embed/([a-zA-Z0-9_-]{11})",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    raise ValueError("Could not extract video ID from URL. Please check the URL.")


def load_cookies_session(cookie_file: str) -> requests.Session:
    session = requests.Session()
    with open(cookie_file, "r") as f:
        for line in f:
            if line.startswith("#") or line.strip() == "":
                continue
            parts = line.strip().split("\t")
            if len(parts) < 7:
                continue
            domain, _, path, secure, _, name, value = parts
            session.cookies.set(name, value, domain=domain, path=path)
    return session


def to_vtt_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}"


# ─────────────────────────────────────────
# Method 1: youtube_transcript_api
# ─────────────────────────────────────────


def method1_youtube_transcript_api(url: str) -> dict:
    """
    Uses youtube_transcript_api + cookies.txt.
    Returns a result dict on success, raises an exception on any failure.
    """
    video_id = extract_video_id(url)

    if not os.path.exists(COOKIES_PATH):
        raise FileNotFoundError("cookies.txt not found — skipping Method 1.")

    session = load_cookies_session(COOKIES_PATH)
    ytt_api = YouTubeTranscriptApi(http_client=session)

    transcript_list = ytt_api.list(video_id)  # raises on failure

    available_languages = [
        {
            "code": t.language_code,
            "language": t.language,
            "auto_generated": t.is_generated,
        }
        for t in transcript_list
    ]

    try:
        transcript = transcript_list.find_transcript(["de", "de-DE"])
    except NoTranscriptFound:
        return {
            "status": "not_found",
            "message": "German subtitles not found for this video.",
            "video_id": video_id,
            "available_languages": available_languages,
            "method_used": "youtube_transcript_api",
        }

    fetched = transcript.fetch()

    output_dir = "subtitles"
    os.makedirs(output_dir, exist_ok=True)
    output_file = f"{output_dir}/{video_id}_de.vtt"

    with open(output_file, "w", encoding="utf-8") as f:
        f.write("WEBVTT\n\n")
        for i, snippet in enumerate(fetched.snippets):
            start = snippet.start
            end = start + snippet.duration
            f.write(f"{i + 1}\n")
            f.write(f"{to_vtt_time(start)} --> {to_vtt_time(end)}\n")
            f.write(f"{snippet.text}\n\n")

    return {
        "status": "success",
        "message": "German subtitles downloaded successfully.",
        "video_id": video_id,
        "subtitle_type": "auto-generated" if transcript.is_generated else "manual",
        "language": transcript.language,
        "total_lines": len(fetched.snippets),
        "output_file": os.path.abspath(output_file),
        "method_used": "youtube_transcript_api",
    }


# ─────────────────────────────────────────
# Method 2: yt_dlp
# ─────────────────────────────────────────


def method2_yt_dlp(url: str) -> dict:
    """
    Uses yt_dlp with browser cookies.
    Returns a result dict on success, raises an exception on any failure.
    """
    ydl_opts_info = {
        "skip_download": True,
        "quiet": True,
        "cookiesfrombrowser": ("firefox",),
        "extractor_args": {"youtube": {"js_runtimes": ["node:/usr/bin/node"]}},
    }

    with yt_dlp.YoutubeDL(ydl_opts_info) as ydl:
        info = ydl.extract_info(url, download=False)  # raises on failure

    available_subtitles = info.get("subtitles", {})
    available_auto_captions = info.get("automatic_captions", {})
    video_title = info.get("title", "Unknown Title")

    german_keys = [
        key
        for key in list(available_subtitles.keys())
        + list(available_auto_captions.keys())
        if key.startswith("de")
    ]

    if not german_keys:
        return {
            "status": "not_found",
            "message": "German subtitles not found for this video.",
            "video_title": video_title,
            "available_languages": list(available_subtitles.keys())
            or list(available_auto_captions.keys()),
            "method_used": "yt_dlp",
        }

    output_dir = "subtitles"
    os.makedirs(output_dir, exist_ok=True)

    ydl_opts_download = {
        "skip_download": True,
        "writesubtitles": True,
        "writeautomaticsub": True,
        "subtitleslangs": ["de"],
        "subtitlesformat": "vtt",
        "outtmpl": f"{output_dir}/%(title)s.%(ext)s",
        "quiet": True,
        "cookiesfrombrowser": ("firefox",),
        "extractor_args": {"youtube": {"js_runtimes": ["node:/usr/bin/node"]}},
    }

    with yt_dlp.YoutubeDL(ydl_opts_download) as ydl:
        ydl.download([url])  # raises on failure

    downloaded_files = [f for f in os.listdir(output_dir) if f.endswith(".vtt")]

    return {
        "status": "success",
        "message": "German subtitles downloaded successfully.",
        "video_title": video_title,
        "subtitle_type": "manual" if "de" in available_subtitles else "auto-generated",
        "downloaded_files": downloaded_files,
        "output_directory": os.path.abspath(output_dir),
        "method_used": "yt_dlp",
    }


# ─────────────────────────────────────────
# Route
# ─────────────────────────────────────────


@app.post("/subtitles/german")
def get_german_subtitles(request: VideoRequest):
    url = request.url

    # Validate URL early so both methods don't have to repeat this error
    try:
        extract_video_id(url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # ── Try Method 1 ──
    try:
        return method1_youtube_transcript_api(url)
    except TranscriptsDisabled:
        # No point trying yt_dlp either — subtitles are genuinely disabled
        raise HTTPException(
            status_code=400, detail="Subtitles are disabled for this video."
        )
    except Exception as e:
        print(f"[Method 1 failed] {type(e).__name__}: {e} — falling back to yt_dlp")

    # ── Fallback: Method 2 ──
    try:
        return method2_yt_dlp(url)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Both methods failed. Last error (yt_dlp): {str(e)}",
        )


@app.get("/")
def root():
    return {
        "message": "YouTube Subtitle Downloader API is running. POST to /subtitles/german"
    }
