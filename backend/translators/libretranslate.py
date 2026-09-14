import httpx
from typing import Dict, Any


async def method2_libretranslate(
    word: str, base_url: str = "http://localhost:5000"
) -> Dict[str, Any]:
    """
    Method 2: Query local LibreTranslate service (fallback source).
    Provides machine translation when PONS is unavailable, rate-limited, or empty.
    """
    clean_base_url = base_url.rstrip("/")
    url = f"{clean_base_url}/translate"
    payload = {
        "q": word,
        "source": "de",
        "target": "en",
        "format": "text",
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.post(
                url,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
    except httpx.RequestError as e:
        return {
            "success": False,
            "status_code": None,
            "error": f"LibreTranslate service unreachable at {clean_base_url}: {type(e).__name__}: {e}",
        }

    if response.status_code != 200:
        return {
            "success": False,
            "status_code": response.status_code,
            "error": f"LibreTranslate returned HTTP {response.status_code}: {response.text}",
        }

    try:
        data = response.json()
    except Exception as e:
        return {
            "success": False,
            "status_code": response.status_code,
            "error": f"Failed to parse LibreTranslate response JSON: {e}",
        }

    translated_text = data.get("translatedText", "").strip()
    if not translated_text:
        return {
            "success": False,
            "status_code": 200,
            "error": f"LibreTranslate returned empty translation for '{word}'",
        }

    return {
        "success": True,
        "word": word,
        "translations": [translated_text],
        "word_class": None,
        "source": "libretranslate",
        "raw_response": data,
    }
