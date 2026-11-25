import yt_dlp
import os
import shutil

import config
from database import BASE_DIR

from utils import extract_video_id


def base_options() -> dict:
    """Options both yt-dlp calls share; browser and Node come from the environment."""
    options = {"quiet": True}

    # empty YTDLP_COOKIES_BROWSER turns browser cookies off
    browser = config.ytdlp_cookies_browser()
    if browser:
        options["cookiesfrombrowser"] = (browser,)

    # no js_runtimes entry when Node is neither configured nor on PATH
    node = config.ytdlp_node() or shutil.which("node")
    if node:
        options["extractor_args"] = {"youtube": {"js_runtimes": [f"node:{node}"]}}
    return options


def not_found(message: str, video_title: str, languages: list) -> dict:
    """Result dict for a video whose German subtitles cannot be fetched."""
    return {
        "status": "not_found",
        "message": message,
        "video_title": video_title,
        "available_languages": languages,
        "method_used": "yt_dlp",
        "vtt_path": None,
    }


def method2_yt_dlp(url: str) -> dict:
    ydl_opts_info = {"skip_download": True, **base_options()}

    with yt_dlp.YoutubeDL(ydl_opts_info) as ydl:
        info = ydl.extract_info(url, download=False)

    available_subtitles = info.get("subtitles", {})
    available_auto_captions = info.get("automatic_captions", {})
    video_title = info.get("title", "Unknown Title")
    languages = list(available_subtitles.keys()) or list(available_auto_captions.keys())

    # manual subs beat auto captions; exact "de" beats variants like de-DE
    lang = None
    for pool in (available_subtitles, available_auto_captions):
        keys = sorted((k for k in pool if k.startswith("de")), key=lambda k: k != "de")
        if keys:
            lang = keys[0]
            break

    if not lang:
        return not_found(
            "German subtitles not found for this video.", video_title, languages
        )

    output_dir = str(BASE_DIR / "subtitles")
    os.makedirs(output_dir, exist_ok=True)

    ydl_opts_download = {
        "skip_download": True,
        "writesubtitles": True,
        "writeautomaticsub": True,
        "subtitleslangs": [lang],
        "subtitlesformat": "vtt",
        "outtmpl": f"{output_dir}/%(id)s.%(ext)s",
        **base_options(),
    }

    with yt_dlp.YoutubeDL(ydl_opts_download) as ydl:
        result = ydl.extract_info(url, download=True)

    # use yt-dlp's own reported path, never scan the folder (stale files)
    vtt_path = ((result.get("requested_subtitles") or {}).get(lang) or {}).get(
        "filepath"
    )
    if not vtt_path or not os.path.isfile(vtt_path):
        return not_found(
            "German subtitles could not be downloaded.", video_title, languages
        )

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
