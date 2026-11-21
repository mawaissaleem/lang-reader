import json
import os
import sys
import unittest

import httpx
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import anki
from routers.anki import anki_pull
from models import Base, Dictionary, UserWord
from tests.test_anki import client_for


class PullTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()

    def tearDown(self):
        self.db.close()

    def word(self, nid, lemma, status):
        d = Dictionary(german_word=lemma, english_meanings=[], source="pons")
        self.db.add(d)
        self.db.flush()
        self.db.add(UserWord(user_id=1, word_id=d.id, status=status, anki_note_id=nid))
        self.db.commit()

    def status(self, lemma):
        return (
            self.db.query(UserWord)
            .join(Dictionary)
            .filter(Dictionary.german_word == lemma)
            .one()
            .status
        )

    def anki(self, notes, ivls):
        """notes: id -> (Lemma, [card ids]); ivls: card id -> interval."""

        def handler(req):
            b = json.loads(req.content)
            if b["action"] == "notesInfo":
                # AnkiConnect returns {} for a note id that no longer exists
                r = [
                    {
                        "noteId": i,
                        "modelName": "Reader Word",
                        "fields": {"Lemma": {"value": notes[i][0]}},
                        "cards": notes[i][1],
                    }
                    if i in notes
                    else {}
                    for i in b["params"]["notes"]
                ]
            elif b["action"] == "cardsInfo":
                r = [{"cardId": c, "interval": ivls[c]} for c in b["params"]["cards"]]
            else:
                raise AssertionError(b["action"])
            return httpx.Response(200, json={"result": r, "error": None})

        return client_for(handler)

    def test_mapping(self):
        self.assertEqual(
            [anki.status_for_interval(d) for d in (0, 1, 6, 7, 20, 21, 400)],
            [
                None,
                "learning2",
                "learning2",
                "learning3",
                "learning3",
                "known",
                "known",
            ],
        )

    async def test_promotes_with_max_interval_over_cards(self):
        self.word(1, "Haus", "learning1")
        with self.anki({1: ("Haus", [10, 11])}, {10: 2, 11: 30}):
            r = await anki.pull_intervals(self.db, 1)
        self.assertEqual(
            (self.status("Haus"), r), ("known", {"changed": 1, "checked": 1})
        )

    async def test_never_demotes_ignores_or_changes_new_cards(self):
        self.word(1, "a", "known")  # lapsed in Anki: stays known
        self.word(2, "b", "ignored")
        self.word(3, "c", "learning1")  # new card, interval 0
        notes = {1: ("a", [10]), 2: ("b", [11]), 3: ("c", [12])}
        with self.anki(notes, {10: 2, 11: 99, 12: 0}):
            r = await anki.pull_intervals(self.db, 1)
        self.assertEqual(
            [self.status(w) for w in "abc"], ["known", "ignored", "learning1"]
        )
        self.assertEqual(r["changed"], 0)

    async def test_skips_note_deleted_in_anki(self):
        self.word(1, "Haus", "learning1")
        self.word(2, "weg", "learning1")  # note 2 deleted in Anki
        with self.anki({1: ("Haus", [10])}, {10: 8}):
            r = await anki.pull_intervals(self.db, 1)
        self.assertEqual(
            (self.status("Haus"), self.status("weg"), r),
            ("learning3", "learning1", {"changed": 1, "checked": 1}),
        )

    async def test_case_exact(self):
        self.word(1, "essen", "learning1")
        with self.anki({1: ("Essen", [10])}, {10: 50}):
            r = await anki.pull_intervals(self.db, 1)
        self.assertEqual((self.status("essen"), r["checked"]), ("learning1", 0))

    async def test_endpoint_errors_when_anki_closed(self):
        def down(req):
            raise httpx.ConnectError("refused")

        self.word(1, "Haus", "learning1")
        with client_for(down), self.assertRaises(HTTPException) as c:
            await anki_pull(user_id=1, db=self.db)
        self.assertEqual(c.exception.status_code, 502)

    async def test_endpoint_success(self):
        self.word(1, "Haus", "learning1")
        with self.anki({1: ("Haus", [10])}, {10: 8}):
            self.assertEqual(
                await anki_pull(user_id=1, db=self.db), {"changed": 1, "checked": 1}
            )
