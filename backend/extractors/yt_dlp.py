import yt_dlp
import os

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
