import os
import sys
import unittest
from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import get_db
from main import app
from models import Base, Subtitle, Video


class TextEndpointTests(unittest.TestCase):
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
        self.client = TestClient(app)  # no context manager: skips startup migrations

    def create(self, title="T", content="eins zwei drei"):
        return self.client.post("/texts", json={"title": title, "content": content})

    def add_subtitle(self, vtt_path):
        with self.Session() as db:
            v = Video(url="https://www.youtube.com/watch?v=abc", title="V")
            db.add(v)
            db.flush()
            s = Subtitle(
                video_id=v.id,
                extraction_method="yt_dlp",
                vtt_path=vtt_path,
                word_count=1,
            )
            db.add(s)
            db.commit()
            return s.id

    def test_cues_from_vtt(self):
        import tempfile

        with tempfile.NamedTemporaryFile(
            "w", suffix=".vtt", delete=False, encoding="utf-8"
        ) as f:
            f.write("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHallo Welt\n")
        self.addCleanup(os.remove, f.name)
        r = self.client.get(f"/subtitles/{self.add_subtitle(f.name)}/cues")
        self.assertEqual(
            r.json(),
            {
                "url": "https://www.youtube.com/watch?v=abc",
                "cues": [{"start": 1.0, "end": 2.0, "text": "Hallo Welt"}],
            },
        )

    def test_cues_missing_vtt_404(self):
        self.assertEqual(
            self.client.get(
                f"/subtitles/{self.add_subtitle('/nope.vtt')}/cues"
            ).status_code,
            404,
        )
        self.assertEqual(self.client.get("/subtitles/999/cues").status_code, 404)

    def test_create_appears_in_library(self):
        r = self.create()
        self.assertEqual(r.status_code, 200)
        entry = r.json()
        self.assertEqual(
            (entry["type"], entry["source"], entry["word_count"]), ("text", "manual", 3)
        )
        lib = self.client.get("/library").json()
        self.assertEqual([e["id"] for e in lib], [entry["id"]])
        self.assertIsNone(lib[0]["video_id"])

    def test_missing_title_defaults_to_untitled(self):
        r = self.client.post("/texts", json={"content": "hallo"})
        self.assertEqual(r.json()["title"], "Untitled")

    def test_empty_content_rejected(self):
        self.assertEqual(self.create(content="  \n ").status_code, 422)

    def test_get_text(self):
        tid = self.create().json()["id"]
        self.assertEqual(
            self.client.get(f"/texts/{tid}").json(), {"text": "eins zwei drei"}
        )

    def test_get_missing_404(self):
        self.assertEqual(self.client.get("/texts/99").status_code, 404)

    def test_rename(self):
        tid = self.create().json()["id"]
        r = self.client.patch(f"/texts/{tid}/title", json={"title": " Neu "})
        self.assertEqual(r.json(), {"id": tid, "title": "Neu"})
        self.assertEqual(self.client.get("/library").json()[0]["title"], "Neu")

    def test_rename_missing_404(self):
        self.assertEqual(
            self.client.patch("/texts/99/title", json={"title": "x"}).status_code, 404
        )

    def test_rename_empty_rejected(self):
        tid = self.create().json()["id"]
        self.assertEqual(
            self.client.patch(f"/texts/{tid}/title", json={"title": " "}).status_code,
            422,
        )

    def test_library_mixes_newest_first(self):
        db = self.Session()
        now = datetime.now()
        v = Video(url="u", title="vid")
        db.add(v)
        db.flush()
        db.add(
            Subtitle(
                video_id=v.id, extraction_method="x", created_at=now - timedelta(days=1)
            )
        )
        db.commit()
        db.close()
        self.create(title="newer")
        self.assertEqual(
            [e["type"] for e in self.client.get("/library").json()], ["text", "video"]
        )


if __name__ == "__main__":
    unittest.main()
