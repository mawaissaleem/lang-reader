import re
import unicodedata

# in-process cache of each text's unique cleaned words, keyed by (kind, id) and invalidated by a stamp
_words_cache: dict[tuple[str, int], tuple[object, frozenset[str]]] = {}


def clean_word(token: str) -> str:
    """Python twin of cleanWord in frontend/lib/words.ts: keep letters, marks, ' and -; trim edge ' and -."""
    token = token.replace("’", "'")
    kept = "".join(c for c in token if unicodedata.category(c)[0] in "LM" or c in "'-")
    return re.sub(r"^['-]+|['-]+$", "", kept)


def unique_words(text: str) -> frozenset[str]:
    return frozenset(w for w in map(clean_word, text.split()) if w)


def cached_words(key: tuple[str, int], stamp, read_text) -> frozenset[str]:
    hit = _words_cache.get(key)
    if hit and hit[0] == stamp:
        return hit[1]
    words = unique_words(read_text())
    _words_cache[key] = (stamp, words)
    return words


def forget(*keys) -> None:
    """Drop cached word sets."""
    for key in keys:
        _words_cache.pop(key, None)


def count_status(words, statuses: dict[str, str]) -> dict[str, int]:
    """Same match as entryFor in the reader: exact form first, then lowercase. Ignored words are not counted."""
    out = {"known": 0, "learning": 0, "new": 0}
    for w in words:
        s = statuses.get(w) or statuses.get(w.lower())
        if s == "ignored":
            continue
        out["new" if s is None else "known" if s == "known" else "learning"] += 1
    out["total"] = sum(out.values())
    return out
