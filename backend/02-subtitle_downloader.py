from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import yt_dlp
import os

app = FastAPI(title="YouTube Subtitle Downloader")


class VideoRequest(BaseModel):
    url: str


@app.post("/subtitles/german")
def get_german_subtitles(request: VideoRequest):
    url = request.url

    # Step 1: Fetch available subtitles without downloading video
    ydl_opts_info = {
        "skip_download": True,
        "quiet": True,
        "cookiesfrombrowser": (
            "firefox",
        ),  # change to "firefox", "brave", "edge" if needed
        "extractor_args": {"youtube": {"js_runtimes": ["node:/usr/bin/node"]}},
    }

    with yt_dlp.YoutubeDL(ydl_opts_info) as ydl:
        try:
            info = ydl.extract_info(url, download=False)
        except Exception as e:
            raise HTTPException(
                status_code=400, detail=f"Could not fetch video info: {str(e)}"
            )

    available_subtitles = info.get("subtitles", {})
    available_auto_captions = info.get("automatic_captions", {})
    video_title = info.get("title", "Unknown Title")

    # Step 2: Check if German subtitles exist (manual or auto-generated)
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
        }

    # Step 3: Download German subtitles
    output_dir = "subtitles"
    os.makedirs(output_dir, exist_ok=True)

    ydl_opts_download = {
        "skip_download": True,  # Don't download the video
        "writesubtitles": True,  # Download manual subtitles
        "writeautomaticsub": True,  # Download auto-generated if manual not available
        "subtitleslangs": ["de"],  # German only
        "subtitlesformat": "vtt",  # WebVTT format (widely supported)
        "outtmpl": f"{output_dir}/%(title)s.%(ext)s",
        "quiet": True,
        "cookiesfrombrowser": (
            "firefox",
        ),  # change to "firefox", "brave", "edge" if needed
        "extractor_args": {"youtube": {"js_runtimes": ["node:/usr/bin/node"]}},
    }

    with yt_dlp.YoutubeDL(ydl_opts_download) as ydl:
        try:
            ydl.download([url])
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Failed to download subtitles: {str(e)}"
            )

    # Find the downloaded subtitle file
    downloaded_files = [f for f in os.listdir(output_dir) if f.endswith(".vtt")]

    return {
        "status": "success",
        "message": "German subtitles downloaded successfully.",
        "video_title": video_title,
        "subtitle_type": "manual" if "de" in available_subtitles else "auto-generated",
        "downloaded_files": downloaded_files,
        "output_directory": os.path.abspath(output_dir),
    }


@app.get("/")
def root():
    return {
        "message": "YouTube Subtitle Downloader API is running. POST to /subtitles/german"
    }
