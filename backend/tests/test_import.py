import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models import Base, Video, Subtitle
from routers.imports import VideoRequest, get_german_subtitles

NOT_FOUND = {
    "status": "not_found",
    "available_languages": [
        {"code": "en", "language": "English", "auto_generated": False},
        {"code": "fr", "language": "French", "auto_generated": True},
    ],
}
URL = "https://www.youtube.com/watch?v=abcdefghijk"
VTT = "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHallo schöne Welt\n"


class TestGermanImport(unittest.TestCase):
    def setUp(self):
        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=engine)
        self.db = sessionmaker(bind=engine)()
        self.addCleanup(self.db.close)

        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        old = os.getcwd()
        self.addCleanup(os.chdir, old)
        os.chdir(tmp.name)
        self.tmp = tmp.name
        # both modules resolve BASE_DIR in their own module
        for module in ("subtitle_import", "routers.library"):
            patcher = patch(f"{module}.BASE_DIR", Path(tmp.name))
            patcher.start()
            self.addCleanup(patcher.stop)
        self.vtt = os.path.join(tmp.name, "abc.vtt")
        with open(self.vtt, "w", encoding="utf-8") as f:
            f.write(VTT)
        self.ok = {"status": "success", "vtt_path": self.vtt, "title": "T"}

    def _call(self, m1, m2):
        with (
            patch("subtitle_import.method1_youtube_transcript_api", return_value=m1),
            patch("subtitle_import.method2_yt_dlp", return_value=m2),
        ):
            return get_german_subtitles(
                VideoRequest(url=URL, title="Mein Titel"), db=self.db
            )

    def test_success_saves_before_returning(self):
        r = self._call(self.ok, None)
        self.assertEqual(
            set(r),
            {
                "id",
                "video_id",
                "type",
                "source",
                "title",
                "url",
                "language",
                "extraction_method",
                "word_count",
                "created_at",
            },
        )
        self.assertEqual(
            (r["title"], r["url"], r["word_count"]), ("Mein Titel", URL, 3)
        )
        sub = self.db.query(Subtitle).one()
        self.assertEqual(sub.id, r["id"])
        self.assertEqual(sub.word_count, 3)
        self.assertEqual(self.db.query(Video).one().id, r["video_id"])
        self.assertTrue(
            os.path.exists(os.path.join(self.tmp, "cleaned_subtitles", "abc.txt"))
        )

    def test_text_is_readable_from_another_cwd_and_for_relative_paths(self):
        from routers.library import get_subtitle_text

        r = self._call(self.ok, None)
        os.chdir(tempfile.gettempdir())
        self.assertEqual(
            get_subtitle_text(r["id"], db=self.db), {"text": "Hallo schöne Welt"}
        )
        # old rows store a path relative to backend/
        self.db.query(Subtitle).one().txt_path = "cleaned_subtitles/abc.txt"
        self.assertEqual(
            get_subtitle_text(r["id"], db=self.db), {"text": "Hallo schöne Welt"}
        )

    def test_duplicate_returns_409(self):
        self._call(self.ok, None)
        with self.assertRaises(HTTPException) as cm:
            self._call(self.ok, None)
        self.assertEqual(cm.exception.status_code, 409)

    def test_both_not_found_lists_plain_codes(self):
        with self.assertRaises(HTTPException) as cm:
            self._call(NOT_FOUND, {"status": "not_found"})
        self.assertEqual(cm.exception.status_code, 404)
        self.assertIn("Available languages: en, fr", cm.exception.detail)

    def test_yt_dlp_codes_formatted(self):
        with self.assertRaises(HTTPException) as cm:
            self._call(
                None, {"status": "not_found", "available_languages": ["en", "fr"]}
            )
        self.assertIn("Available languages: en, fr", cm.exception.detail)

    def test_method1_not_found_falls_back_to_yt_dlp(self):
        r = self._call(NOT_FOUND, self.ok)
        self.assertEqual(r["extraction_method"], "yt_dlp")

    def test_cleaning_failure_returns_500_and_saves_nothing(self):
        with patch(
            "subtitle_import.extract_subtitles", side_effect=ValueError("bad vtt")
        ):
            with self.assertLogs("subtitle_import", "ERROR") as logs:
                with self.assertRaises(HTTPException) as cm:
                    self._call(self.ok, None)
        self.assertEqual(cm.exception.status_code, 500)
        # the exception text goes to the log, not to the user
        self.assertEqual(cm.exception.detail, "Failed to process subtitles.")
        self.assertIn("bad vtt", "\n".join(logs.output))
        self.assertEqual(self.db.query(Subtitle).count(), 0)
        self.assertEqual(self.db.query(Video).count(), 0)

    def test_unexpected_error_is_not_swallowed(self):
        with patch("subtitle_import.extract_subtitles", side_effect=KeyError("bug")):
            with self.assertRaises(KeyError):
                self._call(self.ok, None)


if __name__ == "__main__":
    unittest.main()
