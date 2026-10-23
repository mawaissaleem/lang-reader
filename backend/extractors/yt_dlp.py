import yt_dlp
import os

from database import BASE_DIR

from utils import extract_video_id


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

    # manual subs beat auto captions; exact "de" beats variants like de-DE
    lang = None
    for pool in (available_subtitles, available_auto_captions):
        keys = sorted((k for k in pool if k.startswith("de")), key=lambda k: k != "de")
        if keys:
            lang = keys[0]
            break

    if not lang:
        return {
            "status": "not_found",
            "message": "German subtitles not found for this video.",
            "video_title": video_title,
            "available_languages": list(available_subtitles.keys())
            or list(available_auto_captions.keys()),
            "method_used": "yt_dlp",
            "vtt_path": None,
        }

    output_dir = str(BASE_DIR / "subtitles")
    os.makedirs(output_dir, exist_ok=True)

    ydl_opts_download = {
        "skip_download": True,
        "writesubtitles": True,
        "writeautomaticsub": True,
        "subtitleslangs": [lang],
        "subtitlesformat": "vtt",
        "outtmpl": f"{output_dir}/%(id)s.%(ext)s",
        "quiet": True,
        "cookiesfrombrowser": ("firefox",),
        "extractor_args": {"youtube": {"js_runtimes": ["node:/usr/bin/node"]}},
    }

    with yt_dlp.YoutubeDL(ydl_opts_download) as ydl:
        result = ydl.extract_info(url, download=True)

    # use yt-dlp's own reported path, never scan the folder (stale files)
    vtt_path = ((result.get("requested_subtitles") or {}).get(lang) or {}).get(
        "filepath"
    )
    if not vtt_path or not os.path.isfile(vtt_path):
        return {
            "status": "not_found",
            "message": "German subtitles could not be downloaded.",
            "video_title": video_title,
            "available_languages": list(available_subtitles.keys())
            or list(available_auto_captions.keys()),
            "method_used": "yt_dlp",
            "vtt_path": None,
        }

    return {
        "status": "success",
        "message": "German subtitles downloaded successfully.",
        "video_title": video_title,
        "subtitle_type": "manual" if lang in available_subtitles else "auto-generated",
        "downloaded_files": [os.path.basename(vtt_path)],
        "output_directory": os.path.abspath(output_dir),
        "method_used": "yt_dlp",
        "vtt_path": os.path.abspath(vtt_path),
    }
