import asyncio
import hashlib
import html
import logging
import os
import re

import httpx

from lemmatizer import NOUNS, analyze
from models import Dictionary, ManualText, SentenceTranslation, Setting, Subtitle, UserWord
from translators.pons import strip_html

ANKI_URL = os.getenv("ANKI_CONNECT_URL", "http://localhost:8765")


class AnkiError(Exception):
    """Anki is unreachable or AnkiConnect returned an error."""


class AnkiUnreachable(AnkiError):
    """Anki is closed (as opposed to AnkiConnect rejecting a request)."""


async def invoke(action: str, **params):
    """Call one AnkiConnect action (API version 6) and return its result."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.post(ANKI_URL, json={"action": action, "version": 6, "params": params})
        body = r.json()
    except (httpx.HTTPError, ValueError) as e:
        raise AnkiUnreachable(f"Anki is not reachable: {e}") from e
    if body.get("error"):
        raise AnkiError(body["error"])
    return body.get("result")


DECKS = ["German::Reader::Words", "German::Reader::Sentences"]

_CSS = ".card { font-family: sans-serif; font-size: 20px; text-align: center; }"
_PLURAL = "{{#Plural}}<div>Pl.: {{Plural}}</div>{{/Plural}}"
_AUDIO = "{{#Audio}}<div>{{Audio}}</div>{{/Audio}}"
_LEMMA = "{{#Article}}{{Article}} {{/Article}}{{Lemma}}"
_PAIR = "{{#SentenceDE}}<p>{{SentenceDE}}</p>{{/SentenceDE}}{{#SentenceEN}}<p><i>{{SentenceEN}}</i></p>{{/SentenceEN}}"
_ANS = "{{FrontSide}}<hr id=answer>"

# Each model: fields in order, and (name, front, back) per card template.
MODELS = {
    "Reader Word": (
        ["Lemma", "Article", "Plural", "WordClass", "Meaning", "SentenceDE", "SentenceEN", "Audio", "Source"],
        [
            ("DE→EN", f"<div>{_LEMMA}</div>{_AUDIO}",
             f"{_ANS}<div>{{{{Meaning}}}}</div>{_PAIR}<small>{{{{WordClass}}}}</small>"),
            ("EN→DE", "{{Meaning}}", f"{_ANS}<div>{_LEMMA}</div>{_PLURAL}{_AUDIO}"),
        ],
    ),
    "Reader Sentence": (
        ["SentenceDE", "SentenceEN", "TargetWord", "Audio", "Source"],
        [
            # SentenceDE is stored with the target word already wrapped in <b> by the note builder.
            ("DE→EN", f"<div>{{{{SentenceDE}}}}</div>{_AUDIO}",
             f"{_ANS}<p>{{{{SentenceEN}}}}</p>{{{{#TargetWord}}}}<small>{{{{TargetWord}}}}</small>{{{{/TargetWord}}}}"),
            ("EN→DE", "{{SentenceEN}}", f"{_ANS}<div>{{{{SentenceDE}}}}</div>{_AUDIO}"),
        ],
    ),
}


async def ensure_setup() -> dict:
    """Create the Reader decks and note types if missing. Existing ones are never touched."""
    created = {"decks": [], "models": []}
    have_decks = set(await invoke("deckNames"))
    for deck in DECKS:
        if deck not in have_decks:
            await invoke("createDeck", deck=deck)
            created["decks"].append(deck)
    have_models = set(await invoke("modelNames"))
    for name, (fields, cards) in MODELS.items():
        if name not in have_models:
            await invoke(
                "createModel", modelName=name, inOrderFields=fields, css=_CSS,
                cardTemplates=[{"Name": n, "Front": f, "Back": b} for n, f, b in cards],
            )
            created["models"].append(name)
    return created


_send_lock = asyncio.Lock()  # startup sync and the button must not both add the same note


def _build_note(db, uw: UserWord) -> dict:
    t = next((t for t in uw.word.translations if t.source == uw.source and t.meanings), uw.word)
    meanings = t.meanings if hasattr(t, "meanings") else t.english_meanings
    title = None
    if uw.text_kind == "video":
        sub = db.get(Subtitle, uw.text_id)
        title = sub and sub.video and sub.video.title
    elif uw.text_kind == "text":
        text = db.get(ManualText, uw.text_id)
        title = text and text.title
    sentence = uw.context_sentence or ""
    key = hashlib.sha256(" ".join(sentence.split()).encode()).hexdigest()
    en = db.query(SentenceTranslation).filter_by(sentence_hash=key).first() if sentence else None
    tags = ["reader"]
    slug = re.sub(r"\W+", "-", (title or "").lower()).strip("-")  # Anki tags cannot hold spaces
    if slug:
        tags.append(f"reader::src::{slug}")
    return {
        "deckName": DECKS[0],
        "modelName": "Reader Word",
        "fields": {
            "Lemma": uw.word.german_word,
            "Article": analyze(uw.word.german_word)[2] or "",
            "Plural": "",
            "WordClass": t.word_class or "",
            "Meaning": "; ".join(meanings or []),
            "SentenceDE": sentence,
            "SentenceEN": en.translation if en else "",
            "Audio": "",
            "Source": title or "",
        },
        "options": {"allowDuplicate": False},
        "tags": tags,
    }


def _q(v: str) -> str:
    """Quote a value for Anki search: escape backslash, quote and the * _ wildcards."""
    return '"' + re.sub(r'([\\"*_])', r"\\\1", v) + '"'


async def _find_existing(note: dict):
    """Id of the Reader note with this lemma, or None."""
    q = f'deck:{_q(note["deckName"])} note:{_q(note["modelName"])} {_q("Lemma:" + note["fields"]["Lemma"])}'
    ids = await invoke("findNotes", query=q)
    if not ids:
        return None
    # Anki field search ignores case, but Essen and essen are different words.
    infos = await invoke("notesInfo", notes=ids)
    return next((n["noteId"] for n in infos if n["fields"]["Lemma"]["value"] == note["fields"]["Lemma"]), None)


async def _add_or_update(note: dict, note_id, mapping=None):
    """Update the known note (or one found by lemma) in place, else add. Returns the note id,
    or None when the word is already in the user's mapped deck (nothing is added or changed there)."""
    # Audio is left out so a later-attached recording is not wiped by an update.
    fields = {k: v for k, v in note["fields"].items() if k != "Audio"}
    if note_id:
        try:
            await invoke("updateNoteFields", note={"id": note_id, "fields": fields})
            return note_id
        except AnkiUnreachable:
            raise
        except AnkiError:
            pass  # the note was deleted in Anki; fall back to find/add
    found = await _find_existing(note)
    if found:
        await invoke("updateNoteFields", note={"id": found, "fields": fields})
        return found
    if mapping and await _in_mapped(mapping, note["fields"]["Lemma"]):
        return None
    return await invoke("addNote", note=note)


async def send_pending(db) -> dict:
    """Send every pending word as a note. Raises AnkiError if Anki is unreachable or setup fails;
    notes stay pending then. An AnkiConnect rejection marks that note failed (re-saving with Anki retries it)."""
    async with _send_lock:
        rows = db.query(UserWord).filter(UserWord.anki_status == "pending").all()
        sent = failed = 0
        mapping = get_mapping(db)
        if rows:
            await ensure_setup()
        for uw in rows:
            try:
                note_id = await _add_or_update(_build_note(db, uw), uw.anki_note_id, mapping)
            except AnkiUnreachable:
                break
            except AnkiError as e:
                logging.warning("Anki rejected %r: %s", uw.word.german_word, e)
                uw.anki_status, failed = "failed", failed + 1
                continue
            # note_id None = the user already studies this word; "sent" keeps it from being retried
            uw.anki_status, uw.anki_note_id, sent = "sent", note_id, sent + 1
        db.commit()
        if sent:
            try:
                await invoke("sync")
            except AnkiError:
                pass  # the notes are already in Anki; AnkiWeb sync can happen later
        pending = db.query(UserWord).filter(UserWord.anki_status == "pending").count()
        return {"sent": sent, "failed": failed, "pending": pending}


# ─── The user's existing cards (read-only: only deckNames, modelNames, modelFieldNames, findNotes, notesInfo) ───

def get_mapping(db):
    """{"decks": [...], "model": str, "field": str} chosen on the settings screen, or None."""
    row = db.get(Setting, "anki_mapping")
    return row.value if row else None


def _mapped_query(mapping: dict) -> str:
    decks = " OR ".join(f"deck:{_q(d)}" for d in mapping["decks"])
    return f'({decks}) note:{_q(mapping["model"])}'


def front_key(raw: str) -> str:
    """Card front -> the Dictionary key: 'die Ansage, -n' -> 'Ansage', 'kommen (aus)' -> 'kommen'.
    '' for anything that is not a single word (phrases like 'an sein')."""
    s = html.unescape(strip_html(re.sub(r"<br\s*/?>|<div>", ", ", raw))).replace("\xa0", " ")
    s = re.split(r"[,;]", re.sub(r"\([^)]*\)", "", s))[0].strip()
    m = re.match(r"(der|die|das)\s+", s, re.I)
    word = s[m.end():] if m else s
    if not word or " " in word:
        return ""
    # the reader keys nouns capitalized and everything else lowercase (see lookup_word)
    base, pos, _ = analyze(word)
    return base[:1].upper() + base[1:] if m or pos in NOUNS else base.lower()


async def _in_mapped(mapping: dict, lemma: str) -> bool:
    # wildcards so 'Ansage' also finds 'die Ansage, -n'; the exact check is done on the cleaned value
    inner = _q(f"{mapping['field']}:")[1:-1] + "*" + _q(lemma)[1:-1] + "*"
    ids = await invoke("findNotes", query=f'{_mapped_query(mapping)} "{inner}"')
    for i in range(0, len(ids), 500):
        for n in await invoke("notesInfo", notes=ids[i : i + 500]):
            if front_key(n["fields"].get(mapping["field"], {}).get("value", "")) == lemma:
                return True
    return False


async def import_known(db, user_id: int, mapping: dict) -> dict:
    """Save the mapped field's words as 'known'. Existing saved words keep their status.
    Returns {imported, already_known (already saved, untouched), skipped (not a single word)}."""
    if mapping["field"] not in await invoke("modelFieldNames", modelName=mapping["model"]):
        raise AnkiError(f"Note type '{mapping['model']}' has no field '{mapping['field']}'")
    ids = await invoke("findNotes", query=_mapped_query(mapping))
    words, skipped = set(), 0
    for i in range(0, len(ids), 500):
        for n in await invoke("notesInfo", notes=ids[i : i + 500]):
            key = front_key(n["fields"].get(mapping["field"], {}).get("value", ""))
            if key:
                words.add(key)
            else:
                skipped += 1
    dictionary = {d.german_word: d.id for d in db.query(Dictionary.german_word, Dictionary.id)}
    have = {r[0] for r in db.query(UserWord.word_id).filter(UserWord.user_id == user_id)}
    imported = 0
    for w in words:
        if w not in dictionary:  # a placeholder row; the reader fills in meanings on first lookup
            d = Dictionary(german_word=w, english_meanings=[], source="anki")
            db.add(d)
            db.flush()
            dictionary[w] = d.id
        if dictionary[w] not in have:
            db.add(UserWord(user_id=user_id, word_id=dictionary[w], status="known", anki_status="none"))
            imported += 1
    db.commit()
    return {"imported": imported, "already_known": len(words) - imported, "skipped": skipped}


# ─── .apkg fallback for people without desktop Anki ───

# Fixed once (genanki docs): Anki matches decks and note types by id on import, so these must never change.
_DECK_ID, _MODEL_ID = 1830412501, 1830412502


def export_apkg(db, user_id: int, path: str) -> int:
    """Write the user's Anki-bound words (anki_status != none) to an .apkg; returns the note count.
    Words only: the Sentences deck/model is not filled by the AnkiConnect flow either."""
    import genanki

    fields, cards = MODELS["Reader Word"]
    model = genanki.Model(
        _MODEL_ID, "Reader Word", css=_CSS, fields=[{"name": f} for f in fields],
        templates=[{"name": n, "qfmt": f, "afmt": b} for n, f, b in cards],
    )
    deck = genanki.Deck(_DECK_ID, DECKS[0])
    rows = db.query(UserWord).filter(UserWord.user_id == user_id, UserWord.anki_status != "none").order_by(UserWord.id).all()
    for uw in rows:
        n = _build_note(db, uw)
        f = n["fields"]
        # stable guid: re-importing updates the note instead of duplicating it
        deck.add_note(genanki.Note(
            model=model, fields=[f[k] for k in fields], tags=n["tags"], guid=genanki.guid_for(f["Lemma"], f["SentenceDE"]),
        ))
    genanki.Package(deck).write_to_file(path)
    return len(rows)
