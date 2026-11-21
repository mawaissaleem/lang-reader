"""Unit tests for the subtitle extraction fallback chain, without the HTTP layer."""

import unittest
from unittest.mock import patch

from fastapi import HTTPException
from youtube_transcript_api import TranscriptsDisabled

import subtitle_import

OK = {"status": "success", "vtt_path": "a.vtt"}


class FetchSubtitlesTest(unittest.TestCase):
    def _fetch(self, m1, m2=None):
        with (
            patch("subtitle_import.method1_youtube_transcript_api", **m1) as p1,
            patch("subtitle_import.method2_yt_dlp", **(m2 or {})) as p2,
        ):
            out = subtitle_import.fetch_subtitles("u")
        return out, p1, p2

    def test_transcript_api_success_skips_yt_dlp(self):
        (result, method), _, p2 = self._fetch({"return_value": OK})
        self.assertEqual((result, method), (OK, "transcript_api"))
        p2.assert_not_called()

    def test_exception_falls_back_to_yt_dlp(self):
        (result, method), _, _ = self._fetch(
            {"side_effect": RuntimeError("x")}, {"return_value": OK}
        )
        self.assertEqual(method, "yt_dlp")

    def test_disabled_subtitles_do_not_fall_back(self):
        with self.assertRaises(HTTPException) as cm:
            self._fetch({"side_effect": TranscriptsDisabled("v")})
        self.assertEqual(cm.exception.status_code, 400)

    def test_not_found_lists_languages_from_first_method(self):
        m1 = {"return_value": {"status": "not_found", "available_languages": ["en"]}}
        with self.assertRaises(HTTPException) as cm:
            self._fetch(m1, {"return_value": {"status": "not_found"}})
        self.assertEqual(cm.exception.status_code, 404)
        self.assertIn("Available languages: en", cm.exception.detail)

    def test_yt_dlp_exception_is_500(self):
        with self.assertRaises(HTTPException) as cm:
            self._fetch(
                {"side_effect": RuntimeError("x")}, {"side_effect": OSError("y")}
            )
        self.assertEqual(cm.exception.status_code, 500)


if __name__ == "__main__":
    unittest.main()
