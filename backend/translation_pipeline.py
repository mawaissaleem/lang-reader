"""Word translation providers (PONS, LibreTranslate) and the priority-ordered fallback pipeline."""

import logging
from typing import Any, Awaitable, Callable, Dict, List, NamedTuple, Optional, Tuple

import config
from translators.libretranslate import method2_libretranslate
from translators.pons import method1_pons

logger = logging.getLogger(__name__)


class Translator(NamedTuple):
    """One translation provider: its id, display name, a short note and a factory for its lookup function."""

    id: str
    name: str
    note: str
    make_lookup: Callable[[], Callable[[str], Awaitable[Dict[str, Any]]]]


def _pons_lookup():
    key = config.pons_api_key()
    return lambda word: method1_pons(word, key)


def _libretranslate_lookup():
    url = config.libretranslate_url()
    return lambda word: method2_libretranslate(word, url)


# Registry order is the default order; the settings list and the route read it too.
TRANSLATORS = [
    Translator("pons", "PONS", "dictionary senses and examples", _pons_lookup),
    Translator(
        "libretranslate",
        "LibreTranslate",
        "quick machine translation",
        _libretranslate_lookup,
    ),
]
VALID_PROVIDERS = [t.id for t in TRANSLATORS]


def get_translator_providers():
    """Provider name -> async lookup function; env keys are read when this is called."""
    return {t.id: t.make_lookup() for t in TRANSLATORS}


def parse_priority(priority_str: Optional[str]) -> List[str]:
    """Provider order from a comma list (or the env default); unknown names dropped, missing ones appended."""
    default = config.default_translation_priority()
    raw = priority_str or default or ""
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
