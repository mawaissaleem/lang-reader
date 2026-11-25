import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import progress
from models import Base, Dictionary, ManualText, Subtitle, UserWord, Video
from routers.progress import get_library_progress


class TestCounting(unittest.TestCase):
    def test_clean_word_matches_frontend(self):
        self.assertEqual(progress.clean_word("„Hallo,“"), "Hallo")
        self.assertEqual(progress.clean_word("-nicht’s-"), "nicht's")
        self.assertEqual(progress.clean_word("123"), "")

    def test_counts(self):
        words = progress.unique_words("Haus haus Katze läuft Hund, 42 Hund")
        statuses = {"Haus": "known", "katze": "learning2", "Hund": "ignored"}
        # Haus known, haus -> lowercase miss -> new, Katze -> lowercase learning, läuft new, Hund ignored
        self.assertEqual(
            progress.count_status(words, statuses),
            {"known": 1, "learning": 1, "new": 2, "total": 4},
        )

    def test_empty(self):
        self.assertEqual(progress.count_status(set(), {})["total"], 0)


class TestEndpoint(unittest.TestCase):
    def setUp(self):
        progress._words_cache.clear()
        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=engine)
        self.db = sessionmaker(bind=engine)()
        self.addCleanup(self.db.close)

    def test_text_and_video(self):
        d = Dictionary(german_word="Haus", english_meanings="house", source="pons")
        self.db.add(d)
        self.db.flush()
        self.db.add(UserWord(user_id=1, word_id=d.id, status="known"))
        self.db.add(ManualText(title="t", content="Haus Katze", word_count=2))
        with tempfile.TemporaryDirectory() as tmp:
            f = Path(tmp) / "a.txt"
            f.write_text("Haus Hund Maus", encoding="utf-8")
            v = Video(url="u", title="T")
            v.subtitles.append(
                Subtitle(extraction_method="x", txt_path=str(f), word_count=3)
            )
            self.db.add(v)
            self.db.commit()
            sub_id = v.subtitles[0].id
            out = get_library_progress(db=self.db)
        self.assertEqual(
            out["text-1"], {"known": 1, "learning": 0, "new": 1, "total": 2}
        )
        self.assertEqual(
            out[f"video-{sub_id}"], {"known": 1, "learning": 0, "new": 2, "total": 3}
        )

    def test_missing_file_skipped(self):
        v = Video(url="u", title="T")
        v.subtitles.append(
            Subtitle(extraction_method="x", txt_path="/nope.txt", word_count=1)
        )
        self.db.add(v)
        self.db.commit()
        self.assertEqual(get_library_progress(db=self.db), {})

    def test_cache_skips_rereading(self):
        self.db.add(ManualText(title="t", content="Haus", word_count=1))
        self.db.commit()
        get_library_progress(db=self.db)
        with patch.object(
            progress, "unique_words", side_effect=AssertionError("re-split")
        ):
            get_library_progress(db=self.db)


if __name__ == "__main__":
    unittest.main()
