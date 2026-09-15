import unittest
from unittest.mock import patch, MagicMock, AsyncMock
import httpx
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import sys
import os

# Add backend directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from models import Base, Dictionary, UserWord
from translators.pons import method1_pons
from translators.libretranslate import method2_libretranslate
from main import lookup_word, get_word_meaning


class TestTranslators(unittest.IsolatedAsyncioTestCase):
    async def test_pons_success(self):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = [
            {
                "hits": [
                    {
                        "roms": [
                            {
                                "wordclass": "noun",
                                "arabs": [
                                    {
                                        "translations": [
                                            {"source": "Haus", "target": "house"},
                                            {"source": "Haus", "target": "home"},
                                        ]
                                    }
                                ],
                            }
                        ]
                    }
                ]
            }
        ]

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response
            res = await method1_pons("haus", "dummy_key")
            self.assertTrue(res["success"])
            self.assertEqual(res["word"], "haus")
            self.assertEqual(res["word_class"], "noun")
            self.assertEqual(res["translations"], ["house", "home"])
            self.assertEqual(res["source"], "pons")

    async def test_pons_not_found_204(self):
        mock_response = MagicMock()
        mock_response.status_code = 204

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response
            res = await method1_pons("nonexistentword", "dummy_key")
            self.assertFalse(res["success"])
            self.assertEqual(res["status_code"], 204)

    async def test_pons_rate_limit_429(self):
        mock_response = MagicMock()
        mock_response.status_code = 429

        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response
            res = await method1_pons("haus", "dummy_key")
            self.assertFalse(res["success"])
            self.assertEqual(res["status_code"], 429)

    async def test_libretranslate_success(self):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"translatedText": "house"}

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response
            res = await method2_libretranslate("haus", "http://localhost:5000")
            self.assertTrue(res["success"])
            self.assertEqual(res["translations"], ["house"])
            self.assertEqual(res["source"], "libretranslate")
            self.assertIsNone(res["word_class"])

    async def test_libretranslate_connection_error(self):
        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.side_effect = httpx.ConnectError("Connection refused")
            res = await method2_libretranslate("haus", "http://localhost:5000")
            self.assertFalse(res["success"])
            self.assertIn("unreachable", res["error"])


class TestLookupWordFallback(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)
        self.db = self.SessionLocal()

    def tearDown(self):
        self.db.close()

    async def test_fallback_to_libretranslate_when_pons_fails(self):
        # Mock PONS failure (429 rate limit)
        mock_pons = {
            "success": False,
            "status_code": 429,
            "error": "PONS monthly request limit reached",
        }
        # Mock LibreTranslate success
        mock_lt = {
            "success": True,
            "word": "kaffee",
            "translations": ["coffee"],
            "word_class": None,
            "source": "libretranslate",
            "raw_response": {"translatedText": "coffee"},
        }

        with patch("main.method1_pons", new_callable=AsyncMock) as mock_p, patch(
            "main.method2_libretranslate", new_callable=AsyncMock
        ) as mock_l:
            mock_p.return_value = mock_pons
            mock_l.return_value = mock_lt

            res = await lookup_word("kaffee", user_id=1, db=self.db)
            self.assertEqual(res["source"], "libretranslate")
            self.assertEqual(res["word"], "kaffee")
            self.assertEqual(res["english_meanings"], ["coffee"])

            # Verify saved in db
            saved = self.db.query(Dictionary).filter_by(german_word="kaffee").first()
            self.assertIsNotNone(saved)
            self.assertEqual(saved.source, "libretranslate")

            # Verify cache on second lookup (neither translator called)
            mock_p.reset_mock()
            mock_l.reset_mock()

            cached_res = await lookup_word("kaffee", user_id=1, db=self.db)
            self.assertEqual(cached_res["source"], "cache")
            mock_p.assert_not_called()
            mock_l.assert_not_called()

    async def test_both_methods_fail_raises_404(self):
        mock_pons = {"success": False, "status_code": 204, "error": "Not found"}
        mock_lt = {"success": False, "status_code": None, "error": "Unreachable"}

        with patch("main.method1_pons", new_callable=AsyncMock) as mock_p, patch(
            "main.method2_libretranslate", new_callable=AsyncMock
        ) as mock_l:
            mock_p.return_value = mock_pons
            mock_l.return_value = mock_lt

            with self.assertRaises(HTTPException) as ctx:
                await lookup_word("unknownxyz", user_id=1, db=self.db)

            self.assertEqual(ctx.exception.status_code, 404)
            self.assertIn("Both translation methods failed", ctx.exception.detail)

    async def test_get_word_meaning_fallback(self):
        mock_pons = {"success": False, "status_code": 429, "error": "PONS limit"}
        mock_lt = {
            "success": True,
            "word": "hallo",
            "translations": ["hello"],
            "word_class": None,
            "source": "libretranslate",
            "raw_response": {"translatedText": "hello"},
        }

        with patch("main.method1_pons", new_callable=AsyncMock) as mock_p, patch(
            "main.method2_libretranslate", new_callable=AsyncMock
        ) as mock_l:
            mock_p.return_value = mock_pons
            mock_l.return_value = mock_lt

            res = await get_word_meaning("hallo")
            self.assertTrue(res["success"])
            self.assertEqual(res["source"], "libretranslate")
            self.assertEqual(
                res["translations"], [{"german": "hallo", "english": "hello"}]
            )

    async def test_priority_libretranslate_first_skips_pons_on_success(self):
        # LibreTranslate succeeds and PONS should not be called
        mock_lt = {
            "success": True,
            "word": "kaffee",
            "translations": ["coffee"],
            "word_class": None,
            "source": "libretranslate",
            "raw_response": {"translatedText": "coffee"},
        }

        with patch("main.method1_pons", new_callable=AsyncMock) as mock_p, patch(
            "main.method2_libretranslate", new_callable=AsyncMock
        ) as mock_l:
            mock_p.return_value = {
                "success": False,
                "status_code": 204,
                "error": "Not found",
            }
            mock_l.return_value = mock_lt

            res = await lookup_word(
                "kaffee", user_id=1, priority="libretranslate,pons", db=self.db
            )
            self.assertEqual(res["source"], "libretranslate")
            mock_l.assert_awaited()
            mock_p.assert_not_awaited()

    async def test_priority_libretranslate_first_falls_back_to_pons(self):
        # LibreTranslate fails, PONS should be used as fallback
        mock_lt = {"success": False, "status_code": None, "error": "Unreachable"}
        mock_p = {
            "success": True,
            "word": "kaffee",
            "translations": ["coffee"],
            "word_class": None,
            "source": "pons",
            "raw_response": {"hits": []},
        }

        with patch("main.method1_pons", new_callable=AsyncMock) as mock_p_func, patch(
            "main.method2_libretranslate", new_callable=AsyncMock
        ) as mock_l_func:
            mock_p_func.return_value = mock_p
            mock_l_func.return_value = mock_lt

            res = await lookup_word(
                "kaffee", user_id=1, priority="libretranslate,pons", db=self.db
            )
            self.assertEqual(res["source"], "pons")
            mock_l_func.assert_awaited()
            mock_p_func.assert_awaited()

    async def test_force_true_requeries_and_updates_cache(self):
        # First: PONS returns success and caches source as 'pons'
        mock_p_initial = {
            "success": True,
            "word": "tee",
            "translations": ["tea"],
            "word_class": None,
            "source": "pons",
            "raw_response": {"hits": []},
        }
        mock_lt_updated = {
            "success": True,
            "word": "tee",
            "translations": ["tea (lt)"],
            "word_class": None,
            "source": "libretranslate",
            "raw_response": {"translatedText": "tea (lt)"},
        }

        with patch("main.method1_pons", new_callable=AsyncMock) as mock_p_func, patch(
            "main.method2_libretranslate", new_callable=AsyncMock
        ) as mock_l_func:
            mock_p_func.return_value = mock_p_initial
            mock_l_func.return_value = mock_lt_updated

            # Initial lookup uses PONS and caches it
            res1 = await lookup_word(
                "tee", user_id=1, priority="pons,libretranslate", db=self.db
            )
            self.assertEqual(res1["source"], "pons")

            # Now force a re-lookup with LibreTranslate first and force=True
            res2 = await lookup_word(
                "tee", user_id=1, priority="libretranslate,pons", force=True, db=self.db
            )
            # Should update cache source to libretranslate
            self.assertEqual(res2["source"], "libretranslate")
            saved = self.db.query(Dictionary).filter_by(german_word="tee").first()
            self.assertIsNotNone(saved)
            self.assertEqual(saved.source, "libretranslate")


if __name__ == "__main__":
    unittest.main()
