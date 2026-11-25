import os
import sys
import unittest
from unittest.mock import AsyncMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models import Base, UserWord
from fastapi import HTTPException
from routers.words import get_user_words, lookup_word, save_word

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
        with patch(
            "translation_pipeline.method1_pons",
            new_callable=AsyncMock,
            return_value=PONS_OK,
        ):
            return await lookup_word("kaffee", db=self.db)

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
        first = await save_word(word_id, db=self.db)
        self.assertFalse(first["already_saved"])
        self.assertEqual(self.db.query(UserWord).count(), 1)
        second = await save_word(word_id, db=self.db)
        self.assertTrue(second["already_saved"])
        self.assertEqual(self.db.query(UserWord).count(), 1)


LT_OK = {**PONS_OK, "translations": ["java (drink)"], "source": "libretranslate"}


class TestSaveSource(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        self.db = sessionmaker(bind=engine)()
        self.addCleanup(self.db.close)
        with (
            patch(
                "translation_pipeline.method1_pons",
                new_callable=AsyncMock,
                return_value=PONS_OK,
            ),
            patch(
                "translation_pipeline.method2_libretranslate",
                new_callable=AsyncMock,
                return_value=LT_OK,
            ),
        ):
            await lookup_word("kaffee", db=self.db)
            self.word_id = (
                await lookup_word("kaffee", priority="libretranslate", db=self.db)
            )["id"]

    async def test_save_stores_source(self):
        await save_word(self.word_id, source="libretranslate", db=self.db)
        self.assertEqual(self.db.query(UserWord).one().source, "libretranslate")

    async def test_unknown_source_is_422(self):
        with self.assertRaises(HTTPException) as cm:
            await save_word(self.word_id, source="deepl", db=self.db)
        self.assertEqual(cm.exception.status_code, 422)
        self.assertEqual(self.db.query(UserWord).count(), 0)

    async def test_resave_updates_source(self):
        await save_word(self.word_id, source="pons", db=self.db)
        r = await save_word(self.word_id, source="libretranslate", db=self.db)
        self.assertTrue(r["already_saved"])
        self.assertEqual(self.db.query(UserWord).one().source, "libretranslate")

    async def test_user_words_returns_saved_sources_meanings(self):
        await save_word(self.word_id, source="libretranslate", db=self.db)
        row = get_user_words(db=self.db)[0]
        self.assertEqual(row["source"], "libretranslate")
        self.assertEqual(row["english_meanings"], ["java (drink)"])

    async def test_user_words_without_source_uses_dictionary_mirror(self):
        await save_word(self.word_id, db=self.db)
        row = get_user_words(db=self.db)[0]
        self.assertIsNone(row["source"])
        self.assertEqual(
            row["english_meanings"], self.db.query(UserWord).one().word.english_meanings
        )


class TestWordStatus(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from fastapi.testclient import TestClient
        from sqlalchemy.pool import StaticPool
        import main
        import database

        engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(bind=engine)
        Session = sessionmaker(bind=engine)
        self.db = Session()
        main.app.dependency_overrides[database.get_db] = lambda: self.db
        self.addCleanup(main.app.dependency_overrides.clear)
        self.addCleanup(self.db.close)
        self.client = TestClient(main.app)
        with patch(
            "translation_pipeline.method1_pons",
            new_callable=AsyncMock,
            return_value=PONS_OK,
        ):
            word_id = (await lookup_word("kaffee", db=self.db))["id"]
        await save_word(word_id, db=self.db)
        self.uw_id = self.db.query(UserWord).one().id

    async def test_new_save_defaults_to_learning1(self):
        self.assertEqual(get_user_words(db=self.db)[0]["status"], "learning1")

    async def test_set_status_reads_back(self):
        r = self.client.patch(
            f"/user-words/{self.uw_id}/status", json={"status": "known"}
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.client.get("/user/words").json()[0]["status"], "known")

    async def test_invalid_status_is_422(self):
        r = self.client.patch(
            f"/user-words/{self.uw_id}/status", json={"status": "mastered"}
        )
        self.assertEqual(r.status_code, 422)

    async def test_unknown_id_is_404(self):
        r = self.client.patch("/user-words/999/status", json={"status": "known"})
        self.assertEqual(r.status_code, 404)


class TestSaveContext(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from fastapi.testclient import TestClient
        from sqlalchemy.pool import StaticPool
        import main
        import database

        engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(bind=engine)
        self.db = sessionmaker(bind=engine)()
        main.app.dependency_overrides[database.get_db] = lambda: self.db
        self.addCleanup(main.app.dependency_overrides.clear)
        self.addCleanup(self.db.close)
        self.client = TestClient(main.app)
        with patch(
            "translation_pipeline.method1_pons",
            new_callable=AsyncMock,
            return_value=PONS_OK,
        ):
            self.word_id = (await lookup_word("kaffee", db=self.db))["id"]
        self.url = f"/user-words/{self.word_id}/save"

    async def test_save_stores_and_returns_context(self):
        ctx = {
            "context_sentence": "Ich trinke Kaffee.",
            "text_kind": "text",
            "text_id": 4,
        }
        self.assertEqual(self.client.post(self.url, json=ctx).status_code, 200)
        row = self.client.get("/user/words").json()[0]
        self.assertEqual({k: row[k] for k in ctx}, ctx)

    async def test_save_without_body_still_works(self):
        self.assertEqual(self.client.post(self.url).status_code, 200)
        self.assertIsNone(self.client.get("/user/words").json()[0]["context_sentence"])

    async def test_invalid_kind_is_422(self):
        r = self.client.post(
            self.url, json={"context_sentence": "x", "text_kind": "book", "text_id": 1}
        )
        self.assertEqual(r.status_code, 422)

    async def test_resave_keeps_first_sentence(self):
        self.client.post(
            self.url,
            json={"context_sentence": "Eins.", "text_kind": "text", "text_id": 1},
        )
        self.client.post(
            self.url,
            json={"context_sentence": "Zwei.", "text_kind": "video", "text_id": 2},
        )
        row = self.client.get("/user/words").json()[0]
        self.assertEqual(
            (row["context_sentence"], row["text_kind"], row["text_id"]),
            ("Eins.", "text", 1),
        )

    async def test_resave_fills_missing_sentence(self):
        self.client.post(self.url)
        self.client.post(
            self.url,
            json={"context_sentence": "Zwei.", "text_kind": "video", "text_id": 2},
        )
        row = self.client.get("/user/words").json()[0]
        self.assertEqual(
            (row["context_sentence"], row["text_kind"], row["text_id"]),
            ("Zwei.", "video", 2),
        )


class TestClickedForms(TestSaveContext):
    """Clicked forms (den for der) are kept with the saved word so the reader colours them after a reload."""

    def forms(self):
        return self.client.get("/user/words").json()[0]["forms"]

    async def test_save_remembers_form_once_and_skips_base_form(self):
        self.client.post(self.url, json={"form": "Kaffees"})
        self.client.post(self.url, json={"form": "Kaffees"})
        word = self.client.get("/user/words").json()[0]["word"]
        self.client.post(self.url, json={"form": word})
        self.assertEqual(self.forms(), ["Kaffees"])

    async def test_status_change_remembers_form(self):
        self.client.post(self.url)
        self.assertEqual(self.forms(), [])
        uw_id = self.client.get("/user/words").json()[0]["id"]
        r = self.client.patch(
            f"/user-words/{uw_id}/status", json={"status": "known", "form": "kaffees"}
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.forms(), ["kaffees"])
