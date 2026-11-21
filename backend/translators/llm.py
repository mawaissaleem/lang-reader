"""Local LLM (Ollama) helpers: output schema, prompt builder, plain call."""

import json
import os

import httpx

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")

_STR = {"type": "string"}
_NSTR = {"type": ["string", "null"]}
SCHEMA = {
    "type": "object",
    "properties": {
        "lemma": _STR,
        "pos": _STR,
        "article": _NSTR,
        "plural": _NSTR,
        "meaning_in_context": _STR,
        "sentence_translation": _STR,
        "examples": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "properties": {"de": _STR, "en": _STR},
                "required": ["de", "en"],
            },
        },
        "note": _NSTR,
    },
    "required": [
        "lemma",
        "pos",
        "article",
        "plural",
        "meaning_in_context",
        "sentence_translation",
        "examples",
        "note",
    ],
    "additionalProperties": False,
}


def build_prompt(word, lemma, sentence, meanings):
    lines = "\n".join(f"- {m}" for m in meanings)
    return (
        "You are a German teacher for English speakers. Explain the word as it is used "
        "in the sentence. Choose or adapt the meaning from the dictionary meanings below; "
        "do not invent meanings. Use null for article/plural when not a noun or unknown. "
        "Give 2 short, correct German example sentences with English translations.\n\n"
        f"Word: {word}\nBase form: {lemma}\nSentence: {sentence}\n"
        f"Dictionary meanings:\n{lines}\n"
    )


def is_valid(obj):
    """Required keys present with the right types. Turns "" and "null" in article/plural/note into None."""
    if not isinstance(obj, dict):
        return False
    for key in ("article", "plural", "note"):
        if isinstance(obj.get(key), str) and obj[key].strip().lower() in ("", "null"):
            obj[key] = None
    for key in ("lemma", "pos", "meaning_in_context", "sentence_translation"):
        if not isinstance(obj.get(key), str):
            return False
    for key in ("article", "plural", "note"):
        if key not in obj or not (obj[key] is None or isinstance(obj[key], str)):
            return False
    ex = obj.get("examples")
    return (
        isinstance(ex, list)
        and len(ex) > 0
        and all(
            isinstance(e, dict)
            and isinstance(e.get("de"), str)
            and isinstance(e.get("en"), str)
            for e in ex
        )
    )


def generate(model, prompt, timeout=180):
    """One non-streaming call; returns the raw response text."""
    r = httpx.post(
        f"{OLLAMA_URL}/api/generate",
        json={
            "model": model,
            "prompt": prompt,
            "stream": False,
            "format": SCHEMA,
            "options": {"temperature": 0.1, "num_predict": 1024},
        },  # cap stops runaway repeats
        timeout=timeout,
    )
    r.raise_for_status()
    return r.json()["response"]


class LLMError(Exception):
    pass


class ModelMissing(LLMError):
    pass


async def _stream(model, prompt, timeout=180):
    """Yield the text chunks of one streaming Ollama call."""
    body = {
        "model": model,
        "prompt": prompt,
        "stream": True,
        "format": SCHEMA,
        "options": {"temperature": 0.1, "num_predict": 1024},
    }
    try:
        async with httpx.AsyncClient(timeout=timeout) as c:
            async with c.stream("POST", f"{OLLAMA_URL}/api/generate", json=body) as r:
                if r.status_code == 404:
                    raise ModelMissing(
                        f"Model '{model}' is not installed (ollama pull {model})"
                    )
                if r.status_code != 200:
                    raise LLMError(f"Ollama returned {r.status_code}")
                async for line in r.aiter_lines():
                    if line:
                        obj = json.loads(line)
                        if obj.get(
                            "error"
                        ):  # Ollama can fail after a 200 (e.g. runner out of memory)
                            raise LLMError(f"Ollama: {obj['error']}")
                        yield obj.get("response", "")
    except httpx.TransportError as e:
        raise LLMError(
            f"Ollama is not reachable at {OLLAMA_URL}: {type(e).__name__}"
        ) from e


async def ask(model, prompt):
    """Yield ("token", text) while generating, then ("result", obj) once the JSON is valid.
    Invalid JSON is retried once (after a ("retry", None) marker), then LLMError."""
    for attempt in range(2):
        if attempt:
            yield "retry", None
        text = ""
        async for chunk in _stream(model, prompt):
            text += chunk
            yield "token", chunk
        try:
            obj = json.loads(text)
        except ValueError:
            continue
        if is_valid(obj):
            yield "result", obj
            return
    raise LLMError("The model did not return valid JSON, try again")


async def list_models():
    """Every model the local Ollama has, fetched live: [{"name", "size"}]."""
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{OLLAMA_URL}/api/tags")
        r.raise_for_status()
        return [
            {"name": m["name"], "size": m.get("size", 0)}
            for m in r.json().get("models", [])
        ]
    except (httpx.HTTPError, ValueError, KeyError) as e:
        raise LLMError(
            f"Ollama is not reachable at {OLLAMA_URL}: {type(e).__name__}"
        ) from e


async def running_models():
    """Models Ollama holds in memory right now: [{"name", "expires_at"}]."""
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(f"{OLLAMA_URL}/api/ps")
        r.raise_for_status()
        return [
            {"name": m["name"], "expires_at": m.get("expires_at")}
            for m in r.json().get("models", [])
        ]
    except (httpx.HTTPError, ValueError, KeyError) as e:
        raise LLMError(
            f"Ollama is not reachable at {OLLAMA_URL}: {type(e).__name__}"
        ) from e


async def unload(model):
    """Free a model from memory (keep_alive 0)."""
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(
                f"{OLLAMA_URL}/api/generate", json={"model": model, "keep_alive": 0}
            )
        r.raise_for_status()
    # Ollama answered, e.g. 404 for a model that is not installed
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise ModelMissing(
                f"Model '{model}' is not installed (ollama pull {model})"
            ) from e
        raise LLMError(f"Ollama returned {e.response.status_code}") from e
    except httpx.HTTPError as e:
        raise LLMError(
            f"Ollama is not reachable at {OLLAMA_URL}: {type(e).__name__}"
        ) from e
