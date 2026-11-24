"""Health checks for the services the app depends on (PONS, LibreTranslate, Ollama, Piper), each reported in plain words."""

import asyncio
import os
import shutil
from urllib.parse import urlparse

import tts
from translation_pipeline import libretranslate_url
from translators import libretranslate, llm

CHECK_TIMEOUT = 2.0  # seconds; a stopped service must not make the settings page hang
START_LIBRETRANSLATE = "docker compose -f docker-compose.libretranslate.yml up"


def _host(url: str) -> str:
    try:
        return urlparse(url).netloc or url
    except ValueError:  # e.g. an unclosed IPv6 bracket in the .env URL
        return url


def check_pons() -> dict:
    """Only checks that a key is set: asking PONS would spend a lookup from the monthly limit on every page load."""
    if not os.getenv("PONS_API_KEY"):
        return {"ok": False, "detail": "No API key. Add PONS_API_KEY to backend/.env"}
    return {"ok": True, "detail": "API key set (not tested, so no lookups are used)"}


async def check_libretranslate() -> dict:
    """LibreTranslate is up when its /languages list answers (no translation is run)."""
    url = libretranslate_url()
    if await libretranslate.is_up(url, CHECK_TIMEOUT):
        return {"ok": True, "detail": f"Running at {_host(url)}"}
    return {
        "ok": False,
        "detail": f"Not reachable at {_host(url)}. Start it with {START_LIBRETRANSLATE}",
    }


async def check_ollama() -> dict:
    """Ollama is up when its model list answers."""
    if await llm.is_up(CHECK_TIMEOUT):
        return {"ok": True, "detail": f"Running at {_host(llm.OLLAMA_URL)}"}
    return {
        "ok": False,
        "detail": f"Not reachable at {_host(llm.OLLAMA_URL)}. Start Ollama to get AI answers",
    }


def check_piper() -> dict:
    """Piper is ready when its voice file and ffmpeg are on disk; nothing is synthesised."""
    if not tts.PIPER.exists():
        return {
            "ok": False,
            "detail": "Piper is not installed, so words play without sound",
        }
    if not tts.voice_path().exists():
        return {
            "ok": False,
            "detail": f"German voice not found ({tts.voice_path().name}), so words play without sound",
        }
    if not shutil.which("ffmpeg"):
        return {
            "ok": False,
            "detail": "ffmpeg is not installed, so words play without sound",
        }
    return {"ok": True, "detail": f"Voice {tts.voice_path().stem} is ready"}


async def all_statuses() -> dict:
    """{service: {ok, detail}} for every checked service, run concurrently."""
    libretranslate, ollama = await asyncio.gather(
        check_libretranslate(), check_ollama()
    )
    return {
        "pons": check_pons(),
        "libretranslate": libretranslate,
        "ollama": ollama,
        "piper": check_piper(),
    }
