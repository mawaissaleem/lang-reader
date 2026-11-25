"""Every setting read from the environment (and backend/.env), plus the request timeouts.

Settings are functions that read the environment on each call, so tests can
patch it. load_dotenv() runs here once, before any setting is read, because
every module that needs a setting imports this one.
"""

import os
import shutil
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Request timeouts in seconds.
LOOKUP_TIMEOUT = 8.0  # PONS and LibreTranslate word lookups
ANKI_TIMEOUT = 5.0
LLM_LIST_TIMEOUT = 10
LLM_LOAD_TIMEOUT = 30
LLM_GENERATE_TIMEOUT = 180
URL_CHECK_TIMEOUT = 5  # YouTube oEmbed title lookup


def cors_origins() -> str:
    """Comma-separated origins the browser may call from."""
    return os.getenv("CORS_ORIGINS", "http://localhost:3000")


def database_url(default: str) -> str:
    """SQLAlchemy URL; `default` is used when DATABASE_URL is unset or empty."""
    return os.getenv("DATABASE_URL") or default


def pons_api_key():
    """PONS dictionary key; without it PONS lookups are skipped."""
    return os.getenv("PONS_API_KEY")


def libretranslate_url() -> str:
    """Where LibreTranslate runs."""
    return os.getenv("LIBRETRANSLATE_URL", "http://localhost:5000")


def default_translation_priority() -> str:
    """Translator order until it is changed in Settings."""
    return os.getenv("DEFAULT_TRANSLATION_PRIORITY", "pons,libretranslate")


def anki_connect_url() -> str:
    """Where AnkiConnect listens."""
    return os.getenv("ANKI_CONNECT_URL", "http://localhost:8765")


def ollama_url() -> str:
    """Where Ollama runs."""
    return os.getenv("OLLAMA_URL", "http://localhost:11434")


def ollama_model():
    """Default AI model, used until one is picked in Settings."""
    return os.getenv("OLLAMA_MODEL")


def piper_voice() -> str:
    """Voice file, relative to backend/ or absolute."""
    return os.getenv("PIPER_VOICE", "voices/de_DE-thorsten-medium.onnx")


def tts_cache_dir() -> str:
    """Where generated mp3 files are kept, relative to backend/."""
    return os.getenv("TTS_CACHE_DIR", "audio_cache")


def piper_bin() -> Path:
    """Piper executable: PIPER_BIN, else `piper` on PATH, else the one next to this Python."""
    found = os.getenv("PIPER_BIN") or shutil.which("piper")
    return Path(found or Path(sys.executable).parent / "piper")


def ytdlp_cookies_browser() -> str:
    """Browser whose cookies yt-dlp uses; empty turns it off."""
    return os.getenv("YTDLP_COOKIES_BROWSER", "firefox")


def ytdlp_node():
    """Path to the Node binary yt-dlp uses; unset means `node` from PATH."""
    return os.getenv("YTDLP_NODE")
