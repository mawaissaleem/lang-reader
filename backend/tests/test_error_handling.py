"""Narrowed error handling: expected failures stay handled, unexpected ones surface or are logged."""

import os
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import requests
from fastapi import HTTPException

import importer
import lemmatizer
import main
import translation_pipeline
import utils
from anki import AnkiUnreachable
from routers.library import get_subtitle_cues
from translators.libretranslate import method2_libretranslate
from translators.pons import method1_pons

BACKEND = Path(__file__).resolve().parent.parent


class VideoTitleTest(unittest.TestCase):
    def test_network_error_gives_placeholder_and_warning(self):
        with patch("utils.requests.get", side_effect=requests.ConnectionError("down")):
            with self.assertLogs("utils", "WARNING"):
                self.assertEqual(utils.get_video_title("u"), "unknown_title")

    def test_bad_json_gives_placeholder(self):
        resp = MagicMock()
        resp.json.side_effect = ValueError("not json")
        with patch("utils.requests.get", return_value=resp):
            self.assertEqual(utils.get_video_title("u"), "unknown_title")

    def test_unexpected_error_surfaces(self):
        with patch("utils.requests.get", side_effect=KeyError("bug")):
            with self.assertRaises(KeyError):
                utils.get_video_title("u")


class LemmaTableTest(unittest.TestCase):
    def _load_with_file(self, content: bytes):
        import tempfile

        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "t.json.gz")
            with open(path, "wb") as f:
                f.write(content)
            with (
                patch.object(lemmatizer, "LOOKUP_PATH", path),
                patch.object(lemmatizer, "lookup", {}),
                patch.dict(sys.modules, {"spacy": None}),
                patch.object(lemmatizer, "nlp", None),
            ):
                with self.assertLogs("lemmatizer", "WARNING") as logs:
                    lemmatizer.load_model()
                return logs.output

    def test_corrupt_gzip_is_logged_not_raised(self):
        out = self._load_with_file(b"not gzip")
        self.assertTrue(any("lemma table" in line for line in out))

    def test_gzip_corrupted_mid_stream_is_logged_not_raised(self):
        import gzip
        import zlib

        # a valid header with a damaged deflate stream raises zlib.error, not OSError
        data = bytearray(gzip.compress(b'{"a": "b"}' * 2000, mtime=0))
        data[10] ^= 0xFF  # first byte after the 10-byte gzip header
        with self.assertRaises(zlib.error):
            gzip.decompress(bytes(data))
        out = self._load_with_file(bytes(data))
        self.assertTrue(any("lemma table" in line for line in out))


class StartupSyncTest(unittest.IsolatedAsyncioTestCase):
    async def test_anki_closed_is_skipped(self):
        with (
            patch("main.send_pending", AsyncMock(side_effect=AnkiUnreachable("x"))),
            patch("main.SessionLocal"),
        ):
            with self.assertLogs("main", "INFO"):
                await main._send_pending_on_start()

    async def test_other_errors_are_logged(self):
        with (
            patch("main.send_pending", AsyncMock(side_effect=KeyError("bug"))),
            patch("main.SessionLocal"),
        ):
            with self.assertLogs("main", "ERROR") as logs:
                await main._send_pending_on_start()
        self.assertIn("Startup Anki sync failed", logs.output[0])


class PipelineLoggingTest(unittest.IsolatedAsyncioTestCase):
    async def test_failed_provider_logs_warning(self):
        failing = AsyncMock(return_value={"success": False, "error": "nope"})
        with patch.object(
            translation_pipeline, "get_translator_providers", lambda: {"pons": failing}
        ):
            with self.assertLogs("translation_pipeline", "WARNING") as logs:
                await translation_pipeline.execute_translation_pipeline("x", ["pons"])
        self.assertIn("nope", logs.output[0])


class TranslatorBadJsonTest(unittest.IsolatedAsyncioTestCase):
    def _client(self, resp):
        client = MagicMock()
        client.__aenter__ = AsyncMock(return_value=client)
        client.__aexit__ = AsyncMock(return_value=False)
        client.get = client.post = AsyncMock(return_value=resp)
        return client

    def _resp(self, exc):
        resp = MagicMock(status_code=200)
        resp.json.side_effect = exc
        return resp

    async def test_pons_bad_json_is_a_failure_result(self):
        client = self._client(self._resp(ValueError("x")))
        with patch("translators.pons.httpx.AsyncClient", return_value=client):
            res = await method1_pons("Haus", "key")
        self.assertFalse(res["success"])
        self.assertIn("parse PONS", res["error"])

    async def test_libretranslate_bad_json_is_a_failure_result(self):
        client = self._client(self._resp(ValueError("x")))
        with patch("translators.libretranslate.httpx.AsyncClient", return_value=client):
            res = await method2_libretranslate("Haus")
        self.assertIn("parse LibreTranslate", res["error"])

    async def test_unexpected_error_surfaces(self):
        client = self._client(self._resp(KeyError("bug")))
        with patch("translators.pons.httpx.AsyncClient", return_value=client):
            with self.assertRaises(KeyError):
                await method1_pons("Haus", "key")


class ReadPdfTest(unittest.TestCase):
    def test_garbage_is_unreadable_and_logged(self):
        with self.assertLogs("importer", "WARNING"):
            with self.assertRaises(importer.ImportError_) as cm:
                importer.read_pdf(b"not a pdf")
        self.assertEqual(str(cm.exception), "Could not read that PDF")


class CuesTest(unittest.TestCase):
    def _call(self, side_effect):
        sub = MagicMock()
        with (
            patch("routers.library.BASE_DIR", BACKEND),
            patch("routers.library.extract_cues", side_effect=side_effect),
        ):
            db = MagicMock()
            sub.vtt_path = "main.py"  # any existing file
            db.query.return_value.filter.return_value.first.return_value = sub
            return get_subtitle_cues(1, db=db)

    def test_malformed_vtt_is_404(self):
        from webvtt.errors import MalformedFileError

        with self.assertRaises(HTTPException) as cm:
            self._call(MalformedFileError("bad"))
        self.assertEqual(cm.exception.status_code, 404)

    def test_unexpected_error_surfaces(self):
        with self.assertRaises(KeyError):
            self._call(KeyError("bug"))


class DotenvOrderTest(unittest.TestCase):
    def test_env_loaded_before_app_modules_read_it(self):
        # a fake load_dotenv sets the variables the way a .env file would; if main
        # imported anki/database first, they would keep their defaults
        code = (
            "import os, dotenv\n"
            "def fake():\n"
            "    os.environ['ANKI_CONNECT_URL'] = 'http://anki.test:1'\n"
            "    os.environ['DATABASE_URL'] = 'sqlite:///:memory:'\n"
            "dotenv.load_dotenv = fake\n"
            "import main, anki, database\n"
            "print(anki.ANKI_URL, database.DATABASE_URL)\n"
        )
        env = {
            k: v
            for k, v in os.environ.items()
            if k not in ("ANKI_CONNECT_URL", "DATABASE_URL")
        }
        out = subprocess.run(
            [sys.executable, "-c", code],
            cwd=BACKEND,
            env=env,
            capture_output=True,
            text=True,
            check=True,
        ).stdout
        self.assertEqual(out.strip(), "http://anki.test:1 sqlite:///:memory:")


if __name__ == "__main__":
    unittest.main()
