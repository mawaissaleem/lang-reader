import re
import httpx
from typing import Optional, Dict, Any


def strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text).strip()


async def method1_pons(word: str, api_key: Optional[str]) -> Dict[str, Any]:
    """
    Method 1: Query PONS Dictionary API (primary source).
    Provides structured dictionary data with word class and definitions.
    """
    if not api_key:
        return {
            "success": False,
            "status_code": 403,
            "error": "PONS_API_KEY is not configured",
        }

    pons_url = "https://api.pons.com/v1/dictionary"
    params = {"q": word, "l": "deen", "language": "de"}
    headers = {"X-Secret": api_key}

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(pons_url, params=params, headers=headers)
    except httpx.RequestError as e:
        return {
            "success": False,
            "status_code": None,
            "error": f"PONS request failed: {type(e).__name__}: {e}",
        }

    if response.status_code == 204:
        return {
            "success": False,
            "status_code": 204,
            "error": f"No results found for '{word}' in PONS",
        }
    elif response.status_code == 403:
        return {
            "success": False,
            "status_code": 403,
            "error": "Invalid PONS API key",
        }
    elif response.status_code == 429:
        return {
            "success": False,
            "status_code": 429,
            "error": "PONS monthly request limit reached",
        }
    elif response.status_code != 200:
        return {
            "success": False,
            "status_code": response.status_code,
            "error": f"PONS error with HTTP status {response.status_code}",
        }

    try:
        raw = response.json()
    except Exception as e:
        return {
            "success": False,
            "status_code": response.status_code,
            "error": f"Failed to parse PONS response JSON: {e}",
        }

    translations = []
    word_class = None

    for hit in raw[0].get("hits", []):
        for rom in hit.get("roms", []):
            if not word_class and rom.get("wordclass"):
                word_class = rom["wordclass"]
            for arab in rom.get("arabs", []):
                for translation in arab.get("translations", []):
                    english = strip_html(translation.get("target", ""))
                    if english and english not in translations:
                        translations.append(english)

    if not translations:
        return {
            "success": False,
            "status_code": 200,
            "error": f"No translations parsed from PONS response for '{word}'",
        }

    return {
        "success": True,
        "word": word,
        "translations": translations,
        "word_class": word_class,
        "source": "pons",
        "raw_response": raw,
    }
