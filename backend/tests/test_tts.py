import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import main
import tts


class TTSTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        env = patch.dict(os.environ, {"TTS_CACHE_DIR": self.dir})
        env.start()
        self.addCleanup(env.stop)
        self.addCleanup(shutil.rmtree, self.dir)
        self.calls = []

        async def fake(text, out):
            self.calls.append(text)
            Path(out).write_bytes(b"mp3")

        p = patch.object(tts, "synth", fake)
        p.start()
        self.addCleanup(p.stop)
        self.client = TestClient(main.app)

    def test_second_request_hits_cache(self):
        for _ in range(2):
            r = self.client.get("/tts", params={"text": "Hallo Welt"})
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.headers["content-type"], "audio/mpeg")
            self.assertIn("max-age", r.headers["cache-control"])
            self.assertEqual(r.content, b"mp3")
        self.assertEqual(len(self.calls), 1)

    def test_whitespace_shares_file(self):
        self.client.get("/tts", params={"text": "Hallo   Welt"})
        self.client.get("/tts", params={"text": "  Hallo Welt\n"})
        self.assertEqual(len(self.calls), 1)

    def test_voice_changes_key(self):
        a = tts.cache_path("Hallo")
        with patch.dict(os.environ, {"PIPER_VOICE": "voices/other.onnx"}):
            self.assertNotEqual(a, tts.cache_path("Hallo"))

    def test_validation(self):
        self.assertEqual(
            self.client.get("/tts", params={"text": "   "}).status_code, 422
        )
        self.assertEqual(self.client.get("/tts").status_code, 422)
        self.assertEqual(
            self.client.get("/tts", params={"text": "a" * 501}).status_code, 422
        )
        self.assertEqual(self.calls, [])

    def test_failure_is_503_and_not_cached(self):
        async def boom(text, out):
            raise tts.TTSError("piper failed")

        with patch.object(tts, "synth", boom):
            r = self.client.get("/tts", params={"text": "Hallo"})
        self.assertEqual(r.status_code, 503)
        self.assertIn("piper failed", r.json()["detail"])
        self.assertEqual(os.listdir(self.dir), [])


@unittest.skipUnless(
    tts.voice_path().exists() and shutil.which("ffmpeg") and tts.PIPER.exists(),
    "piper/voice/ffmpeg missing",
)
class RealSynthTest(unittest.TestCase):
    def test_real_mp3(self):
        with (
            tempfile.TemporaryDirectory() as d,
            patch.dict(os.environ, {"TTS_CACHE_DIR": d}),
        ):
            r = TestClient(main.app).get("/tts", params={"text": "Guten Tag"})
            self.assertEqual(r.status_code, 200)
            self.assertGreater(len(r.content), 1000)


if __name__ == "__main__":
    unittest.main()


class TimeoutTest(unittest.IsolatedAsyncioTestCase):
    async def test_hung_process_is_killed(self):
        with patch.object(tts, "TIMEOUT", 0.05):
            with self.assertRaisesRegex(tts.TTSError, "timed out"):
                await tts._run([sys.executable, "-c", "import time; time.sleep(30)"])
