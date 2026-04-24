from fastapi import FastAPI, HTTPException, BackgroundTasks
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

from vtt_parser import extract_subtitles

app = FastAPI(title="YouTube Subtitle Downloader")

COOKIES_PATH = "cookies.txt"


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
    video_id = extract_video_id(url)

    if not os.path.exists(COOKIES_PATH):
        raise FileNotFoundError("cookies.txt not found — skipping Method 1.")

    session = load_cookies_session(COOKIES_PATH)
    ytt_api = YouTubeTranscriptApi(http_client=session)

    transcript_list = ytt_api.list(video_id)

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
            "vtt_path": None,
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
        "vtt_path": os.path.abspath(output_file),
    }


# ─────────────────────────────────────────
# Method 2: yt_dlp
# ─────────────────────────────────────────


def method2_yt_dlp(url: str) -> dict:
    ydl_opts_info = {
        "skip_download": True,
        "quiet": True,
        "cookiesfrombrowser": ("firefox",),
        "extractor_args": {"youtube": {"js_runtimes": ["node:/usr/bin/node"]}},
    }

    with yt_dlp.YoutubeDL(ydl_opts_info) as ydl:
        info = ydl.extract_info(url, download=False)

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
            "vtt_path": None,
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
        ydl.download([url])

    vtt_files = [
        os.path.join(output_dir, f)
        for f in os.listdir(output_dir)
        if f.endswith(".vtt")
    ]
    latest_vtt = max(vtt_files, key=os.path.getmtime) if vtt_files else None

    return {
        "status": "success",
        "message": "German subtitles downloaded successfully.",
        "video_title": video_title,
        "subtitle_type": "manual" if "de" in available_subtitles else "auto-generated",
        "downloaded_files": [os.path.basename(p) for p in vtt_files],
        "output_directory": os.path.abspath(output_dir),
        "method_used": "yt_dlp",
        "vtt_path": os.path.abspath(latest_vtt) if latest_vtt else None,
    }


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
