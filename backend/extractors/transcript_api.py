from youtube_transcript_api import (
    YouTubeTranscriptApi,
    NoTranscriptFound,
)
import requests
import os

from utils import extract_video_id, load_cookies_session, to_vtt_time

COOKIES_PATH = "cookies.txt"


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
