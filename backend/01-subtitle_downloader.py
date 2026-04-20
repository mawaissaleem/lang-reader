from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from youtube_transcript_api import (
    YouTubeTranscriptApi,
    NoTranscriptFound,
    TranscriptsDisabled,
)
import requests
import os
import re

app = FastAPI(title="YouTube Subtitle Downloader")

COOKIES_PATH = "cookies.txt"  # put cookies.txt in the same folder as this script


class VideoRequest(BaseModel):
    url: str


def extract_video_id(url: str) -> str:
    """Extract YouTube video ID from URL."""
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
    """Load cookies from a Netscape cookies.txt file into a requests Session."""
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


@app.post("/subtitles/german")
def get_german_subtitles(request: VideoRequest):
    url = request.url

    # Step 1: Extract video ID
    try:
        video_id = extract_video_id(url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Step 2: Check cookies file exists
    if not os.path.exists(COOKIES_PATH):
        raise HTTPException(
            status_code=500,
            detail="cookies.txt not found. Export cookies from your browser and place cookies.txt in the same folder as this script.",
        )

    # Step 3: Load cookies into session and init API
    session = load_cookies_session(COOKIES_PATH)
    ytt_api = YouTubeTranscriptApi(http_client=session)

    try:
        transcript_list = ytt_api.list(video_id)
    except TranscriptsDisabled:
        raise HTTPException(
            status_code=400, detail="Subtitles are disabled for this video."
        )
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"Could not fetch transcripts: {str(e)}"
        )

    # Step 4: Collect available languages
    available_languages = []
    for transcript in transcript_list:
        available_languages.append(
            {
                "code": transcript.language_code,
                "language": transcript.language,
                "auto_generated": transcript.is_generated,
            }
        )

    # Step 5: Try to find German subtitles (de or de-DE)
    try:
        transcript = transcript_list.find_transcript(["de", "de-DE"])
    except NoTranscriptFound:
        return {
            "status": "not_found",
            "message": "German subtitles not found for this video.",
            "video_id": video_id,
            "available_languages": available_languages,
        }

    # Step 6: Fetch transcript data
    fetched = transcript.fetch()

    # Step 7: Save as VTT file
    output_dir = "subtitles"
    os.makedirs(output_dir, exist_ok=True)
    output_file = f"{output_dir}/{video_id}_de.vtt"

    def to_vtt_time(seconds):
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        s = seconds % 60
        return f"{h:02d}:{m:02d}:{s:06.3f}"

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
    }


@app.get("/")
def root():
    return {
        "message": "YouTube Subtitle Downloader API is running. POST to /subtitles/german"
    }
