"""Unit tests for the translation pipeline: priority parsing, env read at call time, order and fallback."""

import asyncio
import os
import unittest
from unittest.mock import AsyncMock, patch

import translation_pipeline as tp


class ParsePriorityTest(unittest.TestCase):
    def test_unknown_dropped_and_missing_appended(self):
        self.assertEqual(
            tp.parse_priority("libretranslate, bogus"), ["libretranslate", "pons"]
        )

    def test_default_is_read_from_env_when_called(self):
        with patch.dict(os.environ, {"DEFAULT_TRANSLATION_PRIORITY": "libretranslate"}):
            self.assertEqual(tp.parse_priority(None)[0], "libretranslate")

    def test_pons_key_is_read_when_called(self):
        pons = AsyncMock()
        with (
            patch.dict(os.environ, {"PONS_API_KEY": "k1"}),
            patch("translation_pipeline.method1_pons", pons),
        ):
            providers = tp.get_translator_providers()
            # the env is changed back before the provider runs: the key was captured at call time
            with patch.dict(os.environ, {"PONS_API_KEY": "other"}):
                asyncio.run(providers["pons"]("Haus"))
        pons.assert_awaited_once_with("Haus", "k1")


class PipelineTest(unittest.IsolatedAsyncioTestCase):
    async def test_first_success_wins_and_later_providers_not_called(self):
        ok = {"success": True, "source": "pons", "translations": ["x"]}
        with (
            patch("translation_pipeline.method1_pons", AsyncMock(return_value=ok)),
            patch("translation_pipeline.method2_libretranslate", AsyncMock()) as libre,
        ):
            res, errors = await tp.execute_translation_pipeline(
                "Haus", ["pons", "libretranslate"]
            )
        self.assertEqual(res, ok)
        self.assertEqual(errors, {})
        libre.assert_not_called()

    async def test_failure_falls_through_and_is_reported(self):
        ok = {"success": True, "source": "libretranslate", "translations": ["x"]}
        with (
            patch(
                "translation_pipeline.method1_pons",
                AsyncMock(return_value={"success": False, "error": "down"}),
            ),
            patch(
                "translation_pipeline.method2_libretranslate",
                AsyncMock(return_value=ok),
            ),
        ):
            res, errors = await tp.execute_translation_pipeline(
                "Haus", ["pons", "libretranslate"]
            )
        self.assertEqual(res, ok)
        self.assertEqual(errors, {"pons": "down"})

    async def test_all_failing_returns_none_with_every_error(self):
        fail = AsyncMock(return_value={"success": False})
        with (
            patch("translation_pipeline.method1_pons", fail),
            patch("translation_pipeline.method2_libretranslate", fail),
        ):
            res, errors = await tp.execute_translation_pipeline(
                "Haus", ["libretranslate", "pons"]
            )
        self.assertIsNone(res)
        self.assertEqual(
            errors, {"libretranslate": "libretranslate failed", "pons": "pons failed"}
        )


if __name__ == "__main__":
    unittest.main()
