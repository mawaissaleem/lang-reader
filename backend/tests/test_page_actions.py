import os
import sys
import unittest
from unittest import mock

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import entry_actions
import history
import saved_words
from database import get_db
from main import app
from models import Base, Dictionary, UserWord, WordEvent


class PageMarkKnownTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(engine)
        self.Session = sessionmaker(bind=engine)

        def override():
            db = self.Session()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override
        self.addCleanup(app.dependency_overrides.clear)
        self.client = TestClient(app)

    def save(self, word, status):
        with self.Session() as db:
            d = Dictionary(german_word=word, english_meanings=[], source="pons")
            db.add(d)
            db.flush()
            db.add(UserWord(user_id=1, word_id=d.id, status=status))
            db.commit()

    def statuses(self):
        with self.Session() as db:
            return {
                d.german_word: uw.status
                for uw, d in db.query(UserWord, Dictionary).join(
                    Dictionary, UserWord.word_id == Dictionary.id
                )
            }

    def mark(self, words):
        return self.client.post("/library/mark-new-known", json={"words": words})

    def test_only_new_words_become_known(self):
        self.save("Hund", "learning2")
        self.save("Katze", "ignored")
        self.save("Maus", "known")
        r = self.mark(["Hund", "Katze", "Maus", "Haus", "Baum"])
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["changed"], 2)
        self.assertEqual(
            self.statuses(),
            {
                "Hund": "learning2",
                "Katze": "ignored",
                "Maus": "known",
                "Haus": "known",
                "Baum": "known",
            },
        )

    def test_new_word_not_in_the_request_is_untouched(self):
        self.mark(["Haus"])
        self.assertEqual(self.statuses(), {"Haus": "known"})

    def test_writes_one_event_per_new_word(self):
        self.mark(["Haus", "Baum"])
        with self.Session() as db:
            self.assertEqual(db.query(WordEvent).count(), 2)

    def test_failure_midway_writes_nothing(self):
        real = entry_actions.history.record
        calls = []

        def flaky(*args):
            calls.append(1)
            if len(calls) == 2:
                raise RuntimeError("boom")
            return real(*args)

        with self.Session() as db:
            with mock.patch.object(entry_actions.history, "record", flaky):
                with self.assertRaises(RuntimeError):
                    entry_actions.mark_new_known(db, 1, ["Haus", "Baum", "Zaun"])
        with self.Session() as db:
            self.assertEqual(db.query(UserWord).count(), 0)
            self.assertEqual(db.query(WordEvent).count(), 0)
            self.assertEqual(db.query(Dictionary).count(), 0)

    def test_undo_restores_prior_state_including_events(self):
        self.save("Hund", "learning1")
        with self.Session() as db:
            events_before = db.query(WordEvent).count()
        done = self.mark(["Hund", "Haus", "Baum"]).json()
        r = self.client.post(
            "/library/undo-mark-new-known",
            json={"word_ids": done["word_ids"], "event_ids": done["event_ids"]},
        )
        self.assertEqual(r.json()["removed"], 2)
        self.assertEqual(sorted(r.json()["word_ids"]), sorted(done["word_ids"]))
        self.assertEqual(self.statuses(), {"Hund": "learning1"})
        with self.Session() as db:
            self.assertEqual(db.query(WordEvent).count(), events_before)

    def test_undo_keeps_a_word_changed_since(self):
        done = self.mark(["Haus"]).json()
        with self.Session() as db:
            db.query(UserWord).update({"status": "learning1"})
            db.commit()
        self.client.post(
            "/library/undo-mark-new-known",
            json={"word_ids": done["word_ids"], "event_ids": done["event_ids"]},
        )
        self.assertEqual(self.statuses(), {"Haus": "learning1"})

    def undo(self, done, extra_word_ids=()):
        return self.client.post(
            "/library/undo-mark-new-known",
            json={
                "word_ids": done["word_ids"] + list(extra_word_ids),
                "event_ids": done["event_ids"],
            },
        ).json()

    def event_count(self):
        with self.Session() as db:
            return db.query(WordEvent).count()

    def edit_haus(self, change):
        """Apply `change` to the saved "Haus" word in its own session, then commit."""
        with self.Session() as db:
            uw = db.query(UserWord).one()
            change(db, uw)
            db.commit()

    def test_undo_ignores_an_unrelated_known_word_whose_id_is_posted(self):
        self.save("gehen", "known")
        with self.Session() as db:
            gehen = db.query(UserWord).one()
            history.record(db, 1, gehen.word_id, "known")
            db.commit()
            gehen_id = gehen.id
        done = self.mark(["Haus"]).json()
        result = self.undo(done, extra_word_ids=[gehen_id])
        self.assertEqual(result["word_ids"], done["word_ids"])
        self.assertEqual(self.statuses(), {"gehen": "known"})
        self.assertEqual(self.event_count(), 1)

    def test_undo_keeps_a_word_that_moved_on_and_back_to_known(self):
        done = self.mark(["Haus"]).json()
        self.edit_haus(lambda db, uw: history.set_status(db, uw, "learning1"))
        self.edit_haus(lambda db, uw: history.set_status(db, uw, "known"))
        self.assertEqual(self.undo(done)["removed"], 0)
        self.assertEqual(self.statuses(), {"Haus": "known"})
        self.assertEqual(self.event_count(), 3)

    def test_undo_keeps_a_word_re_saved_with_a_source(self):
        done = self.mark(["Haus"]).json()
        ctx = {"context_sentence": "Das Haus.", "text_kind": "text", "text_id": 1}
        self.edit_haus(
            lambda db, uw: saved_words.update_existing(uw, "pons", ctx, anki=False)
        )
        self.assertEqual(self.undo(done)["removed"], 0)
        self.assertEqual(self.statuses(), {"Haus": "known"})
        self.assertEqual(self.event_count(), 1)

    def test_undo_keeps_a_word_sent_to_anki(self):
        done = self.mark(["Haus"]).json()
        ctx = {"context_sentence": None, "text_kind": None, "text_id": None}
        self.edit_haus(
            lambda db, uw: saved_words.update_existing(uw, None, ctx, anki=True)
        )
        self.assertEqual(self.undo(done)["removed"], 0)
        self.assertEqual(self.statuses(), {"Haus": "known"})

    def test_rejects_empty_and_oversized_input(self):
        self.assertEqual(self.mark([]).status_code, 422)
        self.assertEqual(self.mark(["x" * 101]).status_code, 422)
        self.assertEqual(self.mark([""]).status_code, 422)

    def test_punctuation_only_words_write_nothing(self):
        r = self.mark(["...", "--"])
        self.assertEqual(r.json()["changed"], 0)
        self.assertEqual(self.statuses(), {})


if __name__ == "__main__":
    unittest.main()
