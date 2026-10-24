import json
import os
import sys
import unittest

import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import anki
from main import save_word, anki_sync, anki_pending
from fastapi import HTTPException
from models import Base, Dictionary, ManualText, Translation, UserWord
from tests.test_anki import FakeAnki, client_for


class Fake(FakeAnki):
    """FakeAnki that also answers addNote (ids 100, 101, ...) and can reject or drop sync."""

    def __init__(self, reject=None, sync_error=None):
        super().__init__(decks=anki.DECKS, models=list(anki.MODELS))
        self.reject, self.sync_error = reject, sync_error
        self.notes = {}  # note id -> Lemma

    def _ok(self, result=None):
        return httpx.Response(200, json={"result": result, "error": None})

    def __call__(self, req):
        body = json.loads(req.content)
        if body["action"] == "addNote":
            self.calls.append(("addNote", body["params"]))
            if self.reject:
                return httpx.Response(200, json={"result": None, "error": self.reject})
            nid = 100 + self.actions().count("addNote")
            self.notes[nid] = body["params"]["note"]["fields"]["Lemma"]
            return self._ok(nid)
        if body["action"] == "findNotes":
            self.calls.append(("findNotes", body["params"]))
            q = body["params"]["query"]
            # like real Anki: field search ignores case
            return self._ok([i for i, lemma in self.notes.items() if anki._q("Lemma:" + lemma).lower() in q.lower()])
        if body["action"] == "notesInfo":
            self.calls.append(("notesInfo", body["params"]))
            return self._ok([{"noteId": i, "fields": {"Lemma": {"value": self.notes[i]}}} for i in body["params"]["notes"]])
        if body["action"] == "updateNoteFields":
            self.calls.append(("updateNoteFields", body["params"]))
            note = body["params"]["note"]
            if note["id"] not in self.notes:
                return httpx.Response(200, json={"result": None, "error": f"Note was not found: {note['id']}"})
            return self._ok()
        if body["action"] == "sync" and self.sync_error:
            self.calls.append(("sync", {}))
            return httpx.Response(200, json={"result": None, "error": self.sync_error})
        return super().__call__(req)


def closed(req):
    raise httpx.ConnectError("refused")


class OutboxTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        self.db = sessionmaker(bind=engine)()
        d = Dictionary(german_word="Haus", english_meanings=["house"], source="pons", word_class="noun")
        d.translations.append(Translation(source="pons", meanings=["house", "home"], word_class="noun"))
        self.db.add_all([d, ManualText(title="Mein Text!", content="x", word_count=1)])
        self.db.commit()
        self.word_id = d.id

    def tearDown(self):
        self.db.close()

    def row(self):
        return self.db.query(UserWord).one()

    async def _save(self, anki_flag=True, ctx=None):
        return await save_word(self.word_id, 1, source="pons", anki=anki_flag, body=ctx, db=self.db)

    async def test_plain_save_leaves_anki_none_and_sends_nothing(self):
        fake = Fake()
        with client_for(fake):
            r = await self._save(anki_flag=False)
        self.assertEqual(r["anki_status"], "none")
        self.assertEqual(fake.calls, [])

    async def test_anki_closed_stays_pending_then_sync_delivers(self):
        with client_for(closed):
            r = await self._save()
        self.assertEqual(r["anki_status"], "pending")
        self.assertEqual(self.row().anki_status, "pending")
        self.assertEqual(anki_pending(self.db), {"pending": 1})
        with client_for(closed), self.assertRaises(HTTPException) as cm:
            await anki_sync(self.db)
        self.assertEqual(cm.exception.status_code, 502)
        self.assertEqual(self.row().anki_status, "pending")

        fake = Fake()
        with client_for(fake):
            out = await anki_sync(self.db)
        self.assertEqual(out, {"sent": 1, "failed": 0, "pending": 0})
        self.assertEqual((self.row().anki_status, self.row().anki_note_id), ("sent", 101))
        self.assertEqual(fake.actions()[-1], "sync")

    async def test_save_with_anki_open_sends_note_with_fields_and_tags(self):
        from models import SentenceTranslation
        import hashlib
        sent = "Das Haus ist groß."
        self.db.add(SentenceTranslation(sentence_hash=hashlib.sha256(sent.encode()).hexdigest(), sentence=sent, translation="The house is big."))
        self.db.commit()
        text_id = self.db.query(ManualText).one().id
        from main import SaveContext
        fake = Fake()
        with client_for(fake):
            r = await self._save(ctx=SaveContext(context_sentence=sent, text_kind="text", text_id=text_id))
        self.assertEqual(r["anki_status"], "sent")
        note = next(p for a, p in fake.calls if a == "addNote")["note"]
        self.assertEqual(note["deckName"], "German::Reader::Words")
        self.assertEqual(note["modelName"], "Reader Word")
        self.assertEqual(note["tags"], ["reader", "reader::src::mein-text"])
        self.assertFalse(note["options"]["allowDuplicate"])
        self.assertEqual(note["fields"]["Lemma"], "Haus")
        self.assertEqual(note["fields"]["Meaning"], "house; home")
        self.assertEqual(note["fields"]["SentenceEN"], "The house is big.")
        self.assertEqual(note["fields"]["Audio"], "")

    async def test_rejected_note_is_failed_not_retried_by_sync_but_by_resave(self):
        with client_for(Fake(reject="cannot create note because it is a duplicate")):
            r = await self._save()
        self.assertEqual(r["anki_status"], "failed")
        fake = Fake()
        with client_for(fake):
            self.assertEqual((await anki_sync(self.db))["sent"], 0)
            self.assertNotIn("addNote", fake.actions())
            r = await self._save()
        self.assertEqual(r["anki_status"], "sent")

    async def test_saving_twice_gives_one_note_and_updates(self):
        fake = Fake()
        with client_for(fake):
            await self._save()
            r = await self._save()
        self.assertEqual(r["anki_status"], "sent")
        self.assertEqual(fake.actions().count("addNote"), 1)
        upd = next(p for a, p in fake.calls if a == "updateNoteFields")["note"]
        self.assertEqual((upd["id"], upd["fields"]["Lemma"]), (101, "Haus"))
        self.assertNotIn("Audio", upd["fields"])
        self.assertEqual(len(fake.notes), 1)

    async def test_deleted_note_falls_back_to_add(self):
        fake = Fake()
        with client_for(fake):
            await self._save()
            fake.notes.clear()
            await self._save()
        self.assertEqual(fake.actions().count("addNote"), 2)
        self.assertEqual(self.row().anki_note_id, 102)

    async def test_lost_reply_is_found_not_duplicated(self):
        fake = Fake()
        fake.notes[555] = "Haus"  # added earlier, reply lost, we have no id
        with client_for(fake):
            r = await self._save()
        self.assertEqual(r["anki_status"], "sent")
        self.assertEqual(self.row().anki_note_id, 555)
        self.assertNotIn("addNote", fake.actions())

    async def test_case_only_difference_adds_second_note(self):
        fake = Fake()
        fake.notes[555] = "haus"  # Anki's case-insensitive search for "Haus" finds it
        with client_for(fake):
            await self._save()
        self.assertNotIn("updateNoteFields", fake.actions())
        self.assertEqual(fake.actions().count("addNote"), 1)
        self.assertEqual(self.row().anki_note_id, 101)

    def test_search_value_is_escaped(self):
        self.assertEqual(anki._q('a "b" c:d_e*\\'), '"a \\"b\\" c:d\\_e\\*\\\\"')

    async def test_sync_failure_keeps_notes_sent(self):
        with client_for(Fake(sync_error="AnkiWeb down")):
            r = await self._save()
        self.assertEqual(r["anki_status"], "sent")


class MigrationDefaultTest(unittest.TestCase):
    def test_new_row_defaults_to_none(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        db = sessionmaker(bind=engine)()
        d = Dictionary(german_word="a", english_meanings=["a"], source="pons")
        db.add(d)
        db.flush()
        db.add(UserWord(user_id=1, word_id=d.id))
        db.commit()
        self.assertEqual(db.query(UserWord).one().anki_status, "none")


if __name__ == "__main__":
    unittest.main()
