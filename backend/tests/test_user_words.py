import os
import sys
import unittest
from unittest.mock import AsyncMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models import Base, UserWord
from main import lookup_word, save_word

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
        self.assertEqual(r["source"], "cache")
        self.assertEqual(self.db.query(UserWord).count(), 0)

    async def test_save_creates_then_already_saved(self):
        word_id = (await self._lookup())["id"]
        first = await save_word(word_id, 1, db=self.db)
        self.assertFalse(first["already_saved"])
        self.assertEqual(self.db.query(UserWord).count(), 1)
        second = await save_word(word_id, 1, db=self.db)
        self.assertTrue(second["already_saved"])
        self.assertEqual(self.db.query(UserWord).count(), 1)
