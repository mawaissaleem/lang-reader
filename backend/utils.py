import requests
import re


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


def get_video_title(url: str) -> str:
    try:
        response = requests.get(
            "https://www.youtube.com/oembed",
            params={"url": url, "format": "json"},
            timeout=5,
        )
        response.raise_for_status()
        return response.json().get("title", "unknown_title")
    except Exception:
        return "unknown_title"


def sanitize_filename(title: str) -> str:
    # Remove characters that are invalid in filenames
    title = re.sub(r'[\\/*?:"<>|]', "", title)
    title = title.strip()
    return title


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
