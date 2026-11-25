import os
import sys
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import get_db
from models import Base
from routers.words import lookup_word
import main


class ApiTestCase(unittest.TestCase):
    def setUp(self):
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=engine)
        self.Session = sessionmaker(bind=engine)

        def override():
            db = self.Session()
            try:
                yield db
            finally:
                db.close()

        main.app.dependency_overrides[get_db] = override
        self.addCleanup(main.app.dependency_overrides.clear)
        self.client = TestClient(main.app)


class SettingsApiTest(ApiTestCase):
    def test_empty_by_default(self):
        self.assertEqual(
            self.client.get("/settings").json(),
            {"translator_priority": None, "anki_default": None},
        )

    def test_put_saves_only_sent_keys(self):
        self.client.put("/settings", json={"anki_default": True})
        r = self.client.put(
            "/settings", json={"translator_priority": ["libretranslate", "pons"]}
        )
        self.assertEqual(
            r.json(),
            {"translator_priority": ["libretranslate", "pons"], "anki_default": True},
        )
        self.assertEqual(self.client.get("/settings").json(), r.json())

    def test_unknown_key_is_422(self):
        r = self.client.put("/settings", json={"theme": "dark"})
        self.assertEqual(r.status_code, 422)

    def test_unknown_translator_is_422(self):
        r = self.client.put("/settings", json={"translator_priority": ["bogus"]})
        self.assertEqual(r.status_code, 422)

    def test_null_is_422(self):
        r = self.client.put("/settings", json={"anki_default": None})
        self.assertEqual(r.status_code, 422)

    def test_wrong_type_is_422(self):
        r = self.client.put("/settings", json={"anki_default": "maybe"})
        self.assertEqual(r.status_code, 422)


class LookupUsesSavedPriorityTest(ApiTestCase):
    def look(self, **kw):
        ok = lambda src: {
            "success": True,
            "word": "kaffee",
            "translations": ["coffee"],
            "word_class": None,
            "source": src,
            "raw_response": {},
        }
        with (
            patch(
                "translation_pipeline.method1_pons",
                new_callable=AsyncMock,
                return_value=ok("pons"),
            ),
            patch(
                "translation_pipeline.method2_libretranslate",
                new_callable=AsyncMock,
                return_value=ok("libretranslate"),
            ),
        ):
            import asyncio

            return asyncio.run(lookup_word("kaffee", db=self.Session(), **kw))

    def test_saved_order_is_used_without_priority_query(self):
        self.client.put("/settings", json={"translator_priority": ["libretranslate"]})
        self.assertEqual(self.look()["preferred"], "libretranslate")

    def test_priority_query_wins_over_saved(self):
        self.client.put("/settings", json={"translator_priority": ["libretranslate"]})
        self.assertEqual(self.look(priority="pons")["preferred"], "pons")

    def test_nothing_saved_uses_default(self):
        with patch.dict(os.environ, {"DEFAULT_TRANSLATION_PRIORITY": "pons"}):
            self.assertEqual(self.look()["preferred"], "pons")


if __name__ == "__main__":
    unittest.main()
