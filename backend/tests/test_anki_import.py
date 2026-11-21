import json
import os
import sys
import unittest

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import anki
import main
from models import Base, Dictionary, Translation, UserWord
from tests.test_anki import client_for

MAPPING = {"decks": ["Goethe"], "model": "Vocab", "field": "de_word"}
WRITES = {
    "addNote",
    "updateNoteFields",
    "deleteNotes",
    "changeDeck",
    "createDeck",
    "createModel",
    "sync",
}


class Collection:
    """Anki stand-in holding the user's mapped notes; the Reader deck is empty."""

    def __init__(self, fronts, fields=("Note ID", "de_word")):
        self.fronts, self.fields, self.calls = fronts, list(fields), []

    def __call__(self, req):
        body = json.loads(req.content)
        a, p = body["action"], body["params"]
        self.calls.append((a, p))
        result = {
            "deckNames": ["Goethe", "Default"],
            "modelNames": ["Vocab"],
            "modelFieldNames": self.fields,
            "addNote": 500,
        }.get(a)
        if a == "findNotes":
            result = list(range(len(self.fronts))) if "Goethe" in p["query"] else []
        if a == "notesInfo":
            result = [
                {"noteId": i, "fields": {"de_word": {"value": self.fronts[i]}}}
                for i in p["notes"]
            ]
        return httpx.Response(200, json={"result": result, "error": None})

    def actions(self):
        return [a for a, _ in self.calls]


class FrontKeyTest(unittest.TestCase):
    def test_real_world_fronts(self):
        cases = {
            "die Ansage, -n": "Ansage",
            "Die Welt": "Welt",
            "kommen (aus) ": "kommen",
            "<b>der</b>&nbsp;Anschluss": "Anschluss",
            "Singen": "singen",  # no article and no spaCy model: the reader keys non-nouns lowercase
            "an sein": "",
            "": "",
        }
        for raw, want in cases.items():
            self.assertEqual(anki.front_key(raw), want, raw)


class ImportTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        self.db = sessionmaker(bind=engine)()

    def tearDown(self):
        self.db.close()

    async def test_imports_known_and_counts(self):
        fake = Collection(
            [
                "die Ansage, -n",
                "der Anschluss",
                "der Anschluss",
                "an sein",
                "kommen (aus)",
            ]
        )
        with client_for(fake):
            r = await anki.import_known(self.db, 1, MAPPING)
        self.assertEqual(r, {"imported": 3, "already_known": 0, "skipped": 1})
        rows = {u.word.german_word: u.status for u in self.db.query(UserWord)}
        self.assertEqual(
            rows, {"Ansage": "known", "Anschluss": "known", "kommen": "known"}
        )
        self.assertEqual({u.anki_status for u in self.db.query(UserWord)}, {"none"})
        self.assertFalse(WRITES & set(fake.actions()))

    async def test_existing_word_keeps_status_and_dictionary_row(self):
        d = Dictionary(
            german_word="Anschluss", english_meanings=["link"], source="pons"
        )
        d.translations.append(Translation(source="pons", meanings=["link"]))
        self.db.add(d)
        self.db.flush()
        self.db.add(UserWord(user_id=1, word_id=d.id, status="learning2"))
        self.db.commit()
        with client_for(Collection(["der Anschluss", "das Haus"])):
            r = await anki.import_known(self.db, 1, MAPPING)
        self.assertEqual((r["imported"], r["already_known"]), (1, 1))
        self.assertEqual(
            self.db.query(UserWord).filter_by(word_id=d.id).one().status, "learning2"
        )
        self.assertEqual(
            self.db.query(Dictionary).filter_by(german_word="Anschluss").count(), 1
        )

    async def test_chunks_large_decks(self):
        fake = Collection([f"das Wort{i}" for i in range(1201)])
        with client_for(fake):
            r = await anki.import_known(self.db, 1, MAPPING)
        self.assertEqual(r["imported"], 1201)
        self.assertEqual(fake.actions().count("notesInfo"), 3)

    async def test_unknown_field_is_an_error(self):
        with (
            client_for(Collection([], fields=["Front"])),
            self.assertRaises(anki.AnkiError),
        ):
            await anki.import_known(self.db, 1, MAPPING)


class MappedDuplicateTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        self.db = sessionmaker(bind=engine)()
        d = Dictionary(
            german_word="Anschluss",
            english_meanings=["link"],
            source="pons",
            word_class="noun",
        )
        d.translations.append(
            Translation(source="pons", meanings=["link"], word_class="noun")
        )
        self.db.add(d)
        self.db.flush()
        self.db.add(UserWord(user_id=1, word_id=d.id, anki_status="pending"))
        self.db.add(main.Setting(key="anki_mapping", value=MAPPING))
        self.db.commit()

    def tearDown(self):
        self.db.close()

    async def test_word_in_mapped_deck_is_not_added_or_updated(self):
        fake = Collection(["der Anschluss"])
        fake.decks = anki.DECKS
        with client_for(fake):
            out = await anki.send_pending(self.db)
        self.assertEqual(out["pending"], 0)
        row = self.db.query(UserWord).one()
        self.assertEqual((row.anki_status, row.anki_note_id), ("sent", None))
        self.assertFalse(
            {"addNote", "updateNoteFields", "deleteNotes", "changeDeck"}
            & set(fake.actions())
        )

    async def test_word_not_in_mapped_deck_is_added(self):
        fake = Collection(["das Haus"])
        with client_for(fake):
            await anki.send_pending(self.db)
        self.assertEqual(self.db.query(UserWord).one().anki_note_id, 500)
        self.assertIn("addNote", fake.actions())


class EndpointTest(unittest.TestCase):
    def setUp(self):
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

        main.app.dependency_overrides[main.get_db] = get_db
        self.client = TestClient(main.app)
        self.addCleanup(main.app.dependency_overrides.clear)

    def test_import_saves_mapping_and_returns_counts(self):
        with client_for(Collection(["das Haus"])):
            r = self.client.post("/anki/import?user_id=1", json=MAPPING)
            self.assertEqual(
                r.json(), {"imported": 1, "already_known": 0, "skipped": 0}
            )
            ov = self.client.get("/anki/overview").json()
        self.assertEqual(ov["mapping"], MAPPING)
        self.assertEqual(ov["decks"], ["Goethe", "Default"])

    def test_import_without_deck_is_422(self):
        self.assertEqual(
            self.client.post(
                "/anki/import?user_id=1", json={**MAPPING, "decks": []}
            ).status_code,
            422,
        )

    def test_import_anki_closed_is_502_and_mapping_not_saved(self):
        def closed(req):
            raise httpx.ConnectError("refused")

        with client_for(closed):
            self.assertEqual(
                self.client.post("/anki/import?user_id=1", json=MAPPING).status_code,
                502,
            )
            self.assertEqual(self.client.get("/anki/overview").status_code, 502)
        db = self.Session()
        self.assertIsNone(anki.get_mapping(db))
        db.close()


if __name__ == "__main__":
    unittest.main()
