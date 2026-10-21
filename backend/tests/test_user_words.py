import os
import sys
import unittest
from unittest.mock import AsyncMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models import Base, UserWord
from fastapi import HTTPException
from main import get_user_words, lookup_word, save_word

PONS_OK = {
    "success": True,
    "word": "kaffee",
    "translations": ["coffee"],
    "word_class": None,
    "source": "pons",
    "raw_response": {},
}


class TestLookupDoesNotSave(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        self.db = sessionmaker(bind=engine)()

    def tearDown(self):
        self.db.close()

    async def _lookup(self):
        with patch("main.method1_pons", new_callable=AsyncMock, return_value=PONS_OK):
            return await lookup_word("kaffee", user_id=1, db=self.db)

    async def test_fresh_lookup_creates_no_user_word(self):
        r = await self._lookup()
        self.assertEqual(r["source"], "pons")
        self.assertEqual(self.db.query(UserWord).count(), 0)

    async def test_cache_hit_creates_no_user_word(self):
        await self._lookup()
        r = await self._lookup()
        self.assertEqual(r["source"], "pons")
        self.assertEqual(self.db.query(UserWord).count(), 0)

    async def test_save_creates_then_already_saved(self):
        word_id = (await self._lookup())["id"]
        first = await save_word(word_id, 1, db=self.db)
        self.assertFalse(first["already_saved"])
        self.assertEqual(self.db.query(UserWord).count(), 1)
        second = await save_word(word_id, 1, db=self.db)
        self.assertTrue(second["already_saved"])
        self.assertEqual(self.db.query(UserWord).count(), 1)


LT_OK = {**PONS_OK, "translations": ["java (drink)"], "source": "libretranslate"}


class TestSaveSource(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        self.db = sessionmaker(bind=engine)()
        self.addCleanup(self.db.close)
        with patch("main.method1_pons", new_callable=AsyncMock, return_value=PONS_OK), patch(
            "main.method2_libretranslate", new_callable=AsyncMock, return_value=LT_OK
        ):
            await lookup_word("kaffee", user_id=1, db=self.db)
            self.word_id = (await lookup_word("kaffee", user_id=1, priority="libretranslate", db=self.db))["id"]

    async def test_save_stores_source(self):
        await save_word(self.word_id, 1, source="libretranslate", db=self.db)
        self.assertEqual(self.db.query(UserWord).one().source, "libretranslate")

    async def test_unknown_source_is_422(self):
        with self.assertRaises(HTTPException) as cm:
            await save_word(self.word_id, 1, source="deepl", db=self.db)
        self.assertEqual(cm.exception.status_code, 422)
        self.assertEqual(self.db.query(UserWord).count(), 0)

    async def test_resave_updates_source(self):
        await save_word(self.word_id, 1, source="pons", db=self.db)
        r = await save_word(self.word_id, 1, source="libretranslate", db=self.db)
        self.assertTrue(r["already_saved"])
        self.assertEqual(self.db.query(UserWord).one().source, "libretranslate")

    async def test_user_words_returns_saved_sources_meanings(self):
        await save_word(self.word_id, 1, source="libretranslate", db=self.db)
        row = get_user_words(1, db=self.db)[0]
        self.assertEqual(row["source"], "libretranslate")
        self.assertEqual(row["english_meanings"], ["java (drink)"])

    async def test_user_words_without_source_uses_dictionary_mirror(self):
        await save_word(self.word_id, 1, db=self.db)
        row = get_user_words(1, db=self.db)[0]
        self.assertIsNone(row["source"])
        self.assertEqual(row["english_meanings"], self.db.query(UserWord).one().word.english_meanings)
