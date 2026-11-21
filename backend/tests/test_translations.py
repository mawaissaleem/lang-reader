import os
import sys
import unittest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models import Base, Translation
from routers.words import lookup_word


def ok(source, meaning):
    return {
        "success": True,
        "word": "kaffee",
        "translations": [meaning],
        "word_class": None,
        "source": source,
        "raw_response": {},
    }


FAIL = {"success": False, "status_code": 500, "error": "down"}


class TestTranslationsPerSource(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        self.db = sessionmaker(bind=engine)()
        p = patch(
            "routers.translation.method1_pons",
            new_callable=AsyncMock,
            return_value=ok("pons", "coffee"),
        )
        l = patch(
            "routers.translation.method2_libretranslate",
            new_callable=AsyncMock,
            return_value=ok("libretranslate", "java"),
        )
        self.pons, self.lt = p.start(), l.start()
        self.addCleanup(patch.stopall)
        self.addCleanup(self.db.close)

    def look(self, priority, force=False):
        return lookup_word(
            "kaffee", user_id=1, priority=priority, force=force, db=self.db
        )

    async def test_both_sources_are_kept(self):
        await self.look("pons")
        r = await self.look("libretranslate")
        self.assertEqual(self.db.query(Translation).count(), 2)
        self.assertEqual(set(r["translations"]), {"pons", "libretranslate"})
        self.assertEqual(r["source"], "libretranslate")
        self.assertEqual(r["preferred"], "libretranslate")
        self.assertEqual(r["english_meanings"], ["java"])

    async def test_cached_preferred_makes_no_provider_call(self):
        await self.look("pons")
        self.pons.reset_mock()
        r = await self.look("pons")
        self.pons.assert_not_called()
        self.lt.assert_not_called()
        self.assertEqual(r["source"], "pons")

    async def test_force_refetches_only_preferred(self):
        await self.look("pons")
        self.pons.reset_mock()
        self.lt.return_value = ok("libretranslate", "new")
        r = await self.look("libretranslate,pons", force=True)
        self.pons.assert_not_called()
        self.lt.assert_awaited_once()
        self.assertEqual(r["translations"]["pons"]["meanings"], ["coffee"])
        self.assertEqual(r["translations"]["libretranslate"]["meanings"], ["new"])

    async def test_force_failure_is_502_and_keeps_cache(self):
        await self.look("pons")
        self.lt.return_value = FAIL
        with self.assertRaises(HTTPException) as ctx:
            await self.look("libretranslate", force=True)
        self.assertEqual(ctx.exception.status_code, 502)
        self.assertEqual(self.db.query(Translation).count(), 1)

    async def test_fallback_is_stored_under_its_own_source(self):
        self.pons.return_value = FAIL
        r = await self.look("pons,libretranslate")
        self.assertEqual(r["source"], "libretranslate")
        self.assertEqual(r["preferred"], "pons")
        self.assertEqual(list(r["translations"]), ["libretranslate"])

    async def test_all_fail_nothing_cached_is_404(self):
        self.pons.return_value = self.lt.return_value = FAIL
        with self.assertRaises(HTTPException) as ctx:
            await self.look("pons")
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_all_fail_with_cache_returns_cached_and_errors(self):
        await self.look("pons")
        self.pons.return_value = self.lt.return_value = FAIL
        r = await self.look("libretranslate")
        self.assertEqual(r["source"], "pons")
        self.assertEqual(r["english_meanings"], ["coffee"])
        self.assertIn("libretranslate", r["errors"])

    async def test_failed_preferred_is_not_refetched_while_marker_is_fresh(self):
        self.pons.return_value = FAIL
        await self.look("pons")
        self.pons.reset_mock()
        self.lt.reset_mock()
        r = await self.look("pons")
        self.pons.assert_not_called()
        self.lt.assert_not_called()
        self.assertEqual(r["source"], "libretranslate")

    async def test_stale_marker_retries_preferred(self):
        self.pons.return_value = FAIL
        await self.look("pons")
        marker = self.db.query(Translation).filter_by(source="pons").one()
        marker.updated_at = datetime.utcnow() - timedelta(hours=25)
        self.db.commit()
        self.pons.return_value = ok("pons", "coffee")
        r = await self.look("pons")
        self.pons.assert_awaited()
        self.assertEqual(r["source"], "pons")
        self.assertEqual(r["english_meanings"], ["coffee"])

    async def test_marker_never_appears_in_translations(self):
        self.pons.return_value = FAIL
        await self.look("pons")
        r = await self.look("pons")
        self.assertEqual(
            self.db.query(Translation).filter_by(source="pons").one().meanings, []
        )
        self.assertEqual(list(r["translations"]), ["libretranslate"])

    async def test_force_refetches_preferred_despite_fresh_marker(self):
        self.pons.return_value = FAIL
        await self.look("pons")
        self.pons.return_value = ok("pons", "coffee")
        r = await self.look("pons", force=True)
        self.assertEqual(r["source"], "pons")
        self.assertEqual(set(r["translations"]), {"pons", "libretranslate"})


if __name__ == "__main__":
    unittest.main()
