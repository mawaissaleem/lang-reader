"""Word translation providers (PONS, LibreTranslate) and the priority-ordered fallback pipeline."""

import logging
import os
from typing import Any, Dict, List, Optional, Tuple

from translators.libretranslate import method2_libretranslate
from translators.pons import method1_pons

logger = logging.getLogger(__name__)
VALID_PROVIDERS = ["pons", "libretranslate"]


def libretranslate_url() -> str:
    """LibreTranslate base URL, read from the environment on each call."""
    return os.getenv("LIBRETRANSLATE_URL", "http://localhost:5000")


def get_translator_providers():
    """Provider name -> async lookup function; env keys are read when this is called."""
    pons_key = os.getenv("PONS_API_KEY")
    url = libretranslate_url()
    return {
        "pons": lambda word: method1_pons(word, pons_key),
        "libretranslate": lambda word: method2_libretranslate(word, url),
    }


def parse_priority(priority_str: Optional[str]) -> List[str]:
    """Provider order from a comma list (or the env default); unknown names dropped, missing ones appended."""
    default = os.getenv("DEFAULT_TRANSLATION_PRIORITY", "pons,libretranslate")
    raw = priority_str or default or "pons,libretranslate"
    providers = [p.strip().lower() for p in raw.split(",") if p.strip()]
    result = [p for p in providers if p in VALID_PROVIDERS]
    for v in VALID_PROVIDERS:
        if v not in result:
            result.append(v)
    return result


async def execute_translation_pipeline(
    word: str, priority_order: List[str]
) -> Tuple[Optional[Dict[str, Any]], Dict[str, str]]:
    """Try each provider in order; return (first success or None, {provider: error} for the failures)."""
    providers = get_translator_providers()
    errors = {}
    for provider_name in priority_order:
        provider_func = providers.get(provider_name)
        if not provider_func:
            continue
        res = await provider_func(word)
        if res.get("success"):
            return res, errors
        err = res.get("error", f"{provider_name} failed")
        errors[provider_name] = err
        logger.warning(
            "[%s failed] %s — trying next in priority list", provider_name, err
        )
    return None, errors
