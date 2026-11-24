import asyncio
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import httpx

import main
import service_status
from translators import libretranslate, llm


class ServiceStatusTest(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)

    def get(self, up: bool, pons_key=None):
        # a fixed URL so the user's own .env cannot change the expected message
        env = {"LIBRETRANSLATE_URL": "http://localhost:5000"}
        if pons_key:
            env["PONS_API_KEY"] = pons_key
        with (
            patch.dict(os.environ, env),
            patch.object(libretranslate, "is_up", AsyncMock(return_value=up)),
            patch.object(llm, "is_up", AsyncMock(return_value=up)),
            patch.object(
                service_status.shutil, "which", return_value="/usr/bin/ffmpeg"
            ),
        ):
            if not pons_key:
                os.environ.pop("PONS_API_KEY", None)
            return self.client.get("/services/status")

    def test_everything_up(self):
        with (
            patch.object(service_status.tts, "PIPER", Path(__file__)),
            patch.object(service_status.tts, "voice_path", return_value=Path(__file__)),
        ):
            body = self.get(True, pons_key="secret").json()
        self.assertEqual(
            {k: v["ok"] for k, v in body.items()},
            {"pons": True, "libretranslate": True, "ollama": True, "piper": True},
        )
        self.assertNotIn("secret", str(body))

    def test_libretranslate_down_says_how_to_start_it(self):
        r = self.get(False)
        self.assertEqual(r.status_code, 200)
        lt = r.json()["libretranslate"]
        self.assertFalse(lt["ok"])
        self.assertIn("Not reachable at localhost:5000", lt["detail"])
        self.assertIn("docker compose", lt["detail"])
        self.assertFalse(r.json()["ollama"]["ok"])

    def test_missing_pons_key_and_voice(self):
        with patch.object(
            service_status.tts, "voice_path", return_value=Path("/nope/voice.onnx")
        ):
            body = self.get(True).json()
        self.assertFalse(body["pons"]["ok"])
        self.assertFalse(body["piper"]["ok"])

    def test_timeout_counts_as_down(self):
        timeout = AsyncMock(side_effect=httpx.ConnectTimeout("slow"))
        with patch.object(httpx.AsyncClient, "get", timeout):
            self.assertFalse(asyncio.run(libretranslate.is_up("http://x", 2.0)))
            self.assertFalse(asyncio.run(llm.is_up(2.0)))

    def test_malformed_url_counts_as_down(self):
        for bad in ("http://localhost:50O0", "http://localhost:500000", "http://xn--/"):
            with self.subTest(url=bad):
                self.assertFalse(asyncio.run(libretranslate.is_up(bad, 2.0)))
                with patch.object(llm, "OLLAMA_URL", bad):
                    self.assertFalse(asyncio.run(llm.is_up(2.0)))

    def test_answer_counts_as_up(self):
        async def ok(_client, url, **_kwargs):
            return httpx.Response(200, request=httpx.Request("GET", url))

        with patch.object(httpx.AsyncClient, "get", ok):
            self.assertTrue(asyncio.run(libretranslate.is_up("http://x", 2.0)))
            self.assertTrue(asyncio.run(llm.is_up(2.0)))

    def test_status_survives_malformed_libretranslate_url(self):
        for bad in ("http://localhost:50O0", "http://[::1:5000", "http://localhost:500000", "http://xn--/"):
            with (
                self.subTest(url=bad),
                patch.dict(os.environ, {"LIBRETRANSLATE_URL": bad}),
                patch.object(llm, "is_up", AsyncMock(return_value=True)),
            ):
                r = self.client.get("/services/status")
                self.assertEqual(r.status_code, 200)
                self.assertFalse(r.json()["libretranslate"]["ok"])


if __name__ == "__main__":
    unittest.main()
