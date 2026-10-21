import os
import sys
import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models import Base, Video, Subtitle
from main import get_library


class TestLibrary(unittest.TestCase):
    def test_uses_stored_word_count_without_opening_files(self):
        engine = create_engine(
            "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(bind=engine)
        db = sessionmaker(bind=engine)()
        self.addCleanup(db.close)
        v = Video(url="u", title="T")
        v.subtitles.append(
            Subtitle(extraction_method="x", txt_path="/nope/missing.txt", word_count=42)
        )
        db.add(v)
        db.commit()
        with patch("builtins.open", side_effect=AssertionError("file opened")):
            items = get_library(db=db)
        self.assertEqual(items[0]["word_count"], 42)


if __name__ == "__main__":
    unittest.main()
