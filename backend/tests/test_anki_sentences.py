import json
import os
import sys
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import anki
import main
import database
from models import Base, SentenceCard
from tests.test_anki import FakeAnki, client_for
from tests.test_anki_outbox import closed

BODY = {
    "sentence_de": "Das Haus ist groß.",
    "sentence_en": "The house is big.",
    "target_word": "Haus",
    "source": "AI example",
}


class Fake(FakeAnki):
    """Stores sentence notes (id -> fields) and answers find/info/update like Anki would."""

    def __init__(self):
        super().__init__(decks=anki.DECKS, models=list(anki.MODELS))
        self.notes = {}

    def __call__(self, req):
        body = json.loads(req.content)
        a, p = body["action"], body["params"]
        ok = lambda r=None: httpx.Response(200, json={"result": r, "error": None})
        if a not in ("addNote", "findNotes", "notesInfo", "updateNoteFields"):
            return super().__call__(req)
        self.calls.append((a, p))
        if a == "addNote":
            nid = 100 + len(self.notes)
            self.notes[nid] = dict(p["note"]["fields"])
            return ok(nid)
        if a == "findNotes":
            return ok(
                [
                    i
                    for i, f in self.notes.items()
                    if anki._q("TargetWord:" + f["TargetWord"]) in p["query"]
                ]
            )
        if a == "notesInfo":
            return ok(
                [
                    {
                        "noteId": i,
                        "fields": {k: {"value": v} for k, v in self.notes[i].items()},
                    }
                    for i in p["notes"]
                ]
            )
        self.notes[p["note"]["id"]].update(p["note"]["fields"])
        return ok()


class SentenceApiTest(unittest.TestCase):
    def setUp(self):
        # no real speech synthesis in these tests (audio has its own test file)
        p = patch("anki.tts.get_audio", side_effect=anki.tts.TTSError("off"))
        p.start()
        self.addCleanup(p.stop)
        engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(bind=engine)
        self.Session = sessionmaker(bind=engine)

        def get_db():
            db = self.Session()
            try:
                yield db
            finally:
                db.close()

        main.app.dependency_overrides[database.get_db] = get_db
        self.client = TestClient(main.app)
        self.addCleanup(main.app.dependency_overrides.clear)

    def add(self, **over):
        return self.client.post("/anki/sentences?user_id=1", json={**BODY, **over})

    def test_note_has_bold_target_fields_tags_deck_and_model(self):
        fake = Fake()
        with client_for(fake):
            r = self.add(
                sentence_de="Das haus ist <groß> & alt.", sentence_en="It's big."
            )
        self.assertEqual(r.json(), {"anki_status": "sent", "pending": 0})
        note = next(p for a, p in fake.calls if a == "addNote")["note"]
        self.assertEqual(
            (note["deckName"], note["modelName"]),
            ("German::Reader::Sentences", "Reader Sentence"),
        )
        self.assertEqual(note["tags"], ["reader", "reader::src::ai-example"])
        self.assertEqual(
            note["fields"],
            {
                "SentenceDE": "Das <b>haus</b> ist &lt;groß&gt; &amp; alt.",
                "SentenceEN": "It's big.",
                "TargetWord": "Haus",
                "Audio": "",
                "Source": "AI example",
            },
        )
        self.assertEqual(fake.actions()[-1], "sync")

    def test_inflected_form_is_not_bolded(self):
        note = anki._build_sentence_note(
            SentenceCard(**{**BODY, "sentence_de": "Die Häuser sind groß."})
        )
        self.assertEqual(note["fields"]["SentenceDE"], "Die Häuser sind groß.")

    def test_clicked_form_is_bolded_not_the_lemma(self):
        note = anki._build_sentence_note(
            SentenceCard(
                **{
                    **BODY,
                    "sentence_de": "Er ging nach Hause.",
                    "target_word": "gehen",
                    "bold": ["ging"],
                }
            )
        )
        self.assertEqual(note["fields"]["SentenceDE"], "Er <b>ging</b> nach Hause.")

    def test_separable_verb_bolds_both_parts(self):
        note = anki._build_sentence_note(
            SentenceCard(
                **{
                    **BODY,
                    "sentence_de": "Er fängt morgen an.",
                    "target_word": "anfangen",
                    "bold": ["fängt", "an"],
                }
            )
        )
        self.assertEqual(
            note["fields"]["SentenceDE"], "Er <b>fängt</b> morgen <b>an</b>."
        )

    def test_bold_forms_are_stored_for_the_later_send(self):
        with client_for(closed):
            self.add(
                sentence_de="Er ging nach Hause.", target_word="gehen", bold=["ging"]
            )
        fake = Fake()
        with client_for(fake):
            self.client.post("/anki/sync")
        note = next(p for a, p in fake.calls if a == "addNote")["note"]
        self.assertEqual(note["fields"]["SentenceDE"], "Er <b>ging</b> nach Hause.")

    def test_text_title_becomes_source_and_tag(self):
        fake = Fake()
        with client_for(fake):
            self.add(source="Mein Text!")
        note = next(p for a, p in fake.calls if a == "addNote")["note"]
        self.assertEqual(
            (note["fields"]["Source"], note["tags"][1]),
            ("Mein Text!", "reader::src::mein-text"),
        )

    def test_anki_closed_stays_pending_then_sync_delivers(self):
        with client_for(closed):
            r = self.add()
        self.assertEqual(r.json(), {"anki_status": "pending", "pending": 1})
        self.assertEqual(self.client.get("/anki/pending").json(), {"pending": 1})
        fake = Fake()
        with client_for(fake):
            out = self.client.post("/anki/sync").json()
        self.assertEqual(out, {"sent": 1, "failed": 0, "pending": 0})
        self.assertEqual(len(fake.notes), 1)

    def test_same_sentence_twice_is_one_note(self):
        fake = Fake()
        with client_for(fake):
            self.add()
            r = self.add()
        self.assertEqual(r.json()["anki_status"], "sent")
        self.assertEqual(fake.actions().count("addNote"), 1)
        with self.Session() as db:
            self.assertEqual(db.query(SentenceCard).count(), 1)

    def test_existing_anki_note_is_updated_not_duplicated(self):
        fake = Fake()
        fake.notes[555] = {
            "SentenceDE": "Das <b>Haus</b> ist groß.",
            "SentenceEN": "old",
            "TargetWord": "Haus",
        }
        with client_for(fake):
            self.add()
        self.assertNotIn("addNote", fake.actions())
        self.assertEqual(fake.notes[555]["SentenceEN"], "The house is big.")

    def test_pending_counts_words_and_sentences(self):
        with client_for(closed):
            self.add()
            self.add(target_word="groß")
        self.assertEqual(self.client.get("/anki/pending").json(), {"pending": 2})

    def test_empty_field_is_rejected(self):
        self.assertEqual(self.add(sentence_en="").status_code, 422)

    def test_rejected_note_is_failed_then_retried_on_click(self):
        class Reject(Fake):
            def __call__(self, req):
                if json.loads(req.content)["action"] == "addNote":
                    return httpx.Response(
                        200, json={"result": None, "error": "duplicate"}
                    )
                return super().__call__(req)

        with client_for(Reject()):
            self.assertEqual(self.add().json()["anki_status"], "failed")
        with client_for(Fake()):
            self.assertEqual(self.add().json()["anki_status"], "sent")


if __name__ == "__main__":
    unittest.main()
