import os
import sys
import unittest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import get_db
from main import app
from models import Base, Dictionary, UserWord, Video


class EntryActionTests(unittest.TestCase):
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

    def create(self, content="Haus Hund haus."):
        return self.client.post(
            "/texts", json={"title": "T", "content": content}
        ).json()

    def statuses(self):
        with self.Session() as db:
            return {
                d.german_word: uw.status
                for uw, d in db.query(UserWord, Dictionary).join(
                    Dictionary, UserWord.word_id == Dictionary.id
                )
            }

    def test_text_entry_has_preview(self):
        self.create("a" * 500)
        self.assertEqual(len(self.client.get("/library").json()[0]["preview"]), 240)

    def test_mark_known_saves_new_and_updates_existing(self):
        tid = self.create()["id"]
        with self.Session() as db:
            d = Dictionary(german_word="Hund", english_meanings=["dog"], source="pons")
            db.add(d)
            db.flush()
            db.add(UserWord(user_id=1, word_id=d.id, status="learning1"))
            db.commit()
        r = self.client.post(f"/library/text/{tid}/mark-known")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(
            self.statuses(), {"Hund": "known", "Haus": "known", "haus": "known"}
        )
        self.assertEqual(r.json(), {"changed": 3})

    def test_mark_known_keeps_ignored(self):
        tid = self.create("Haus")["id"]
        with self.Session() as db:
            d = Dictionary(german_word="Haus", english_meanings=[], source="pons")
            db.add(d)
            db.flush()
            db.add(UserWord(user_id=1, word_id=d.id, status="ignored"))
            db.commit()
        self.client.post(f"/library/text/{tid}/mark-known")
        self.assertEqual(self.statuses(), {"Haus": "ignored"})

    def test_mark_known_missing_404(self):
        self.assertEqual(
            self.client.post("/library/text/99/mark-known").status_code, 404
        )

    def test_delete_text(self):
        tid = self.create()["id"]
        self.assertEqual(self.client.delete(f"/library/text/{tid}").status_code, 200)
        self.assertEqual(self.client.get("/library").json(), [])

    def test_delete_text_unlinks_saved_words(self):
        tid = self.create()["id"]
        with self.Session() as db:
            d = Dictionary(german_word="Hund", english_meanings=[], source="pons")
            db.add(d)
            db.flush()
            db.add(UserWord(user_id=1, word_id=d.id, text_kind="text", text_id=tid))
            db.commit()
        self.client.delete(f"/library/text/{tid}")
        with self.Session() as db:
            uw = db.query(UserWord).one()
            self.assertEqual((uw.text_kind, uw.text_id), (None, None))

    def test_delete_video_removes_subtitles(self):
        with self.Session() as db:
            v = Video(url="u", title="V")
            db.add(v)
            db.commit()
            vid = v.id
        self.assertEqual(self.client.delete(f"/library/video/{vid}").status_code, 200)
        with self.Session() as db:
            self.assertEqual(db.query(Video).count(), 0)

    def test_delete_missing_404(self):
        self.assertEqual(self.client.delete("/library/text/99").status_code, 404)
        self.assertEqual(self.client.delete("/library/book/1").status_code, 422)


if __name__ == "__main__":
    unittest.main()
