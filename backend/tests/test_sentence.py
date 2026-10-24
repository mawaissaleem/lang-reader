import asyncio
import os
import tempfile
import sys
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models import Base
from database import get_db
from main import app, translate_sentence

OK = {"success": True, "translations": ["He starts tomorrow."]}


class TestSentenceEndpoint(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=engine)
        Session = sessionmaker(bind=engine)

        def db():
            s = Session()
            try:
                yield s
            finally:
                s.close()

        app.dependency_overrides[get_db] = db
        self.addCleanup(app.dependency_overrides.clear)
        self.client = TestClient(app)  # no `with`: skips lifespan, so the real DB is untouched

    def get(self, text):
        return self.client.get("/sentence", params={"text": text})

    def test_second_request_is_served_from_cache(self):
        with patch("main.method2_libretranslate", new_callable=AsyncMock, return_value=OK) as m:
            r1 = self.get("Er fängt morgen an.")
            r2 = self.get("  Er fängt   morgen an. ")  # same sentence after normalizing
        self.assertEqual(r1.json(), {"sentence": "Er fängt morgen an.", "translation": "He starts tomorrow."})
        self.assertEqual(r2.json(), r1.json())
        m.assert_awaited_once()

    def test_empty_and_too_long_are_422(self):
        self.assertEqual(self.get("   ").status_code, 422)
        self.assertEqual(self.get("a" * 1001).status_code, 422)

    def test_failure_is_502_and_not_cached(self):
        bad = {"success": False, "error": "down"}
        with patch("main.method2_libretranslate", new_callable=AsyncMock, side_effect=[bad, OK]) as m:
            self.assertEqual(self.get("Hallo Welt.").status_code, 502)
            self.assertEqual(self.get("Hallo Welt.").status_code, 200)
        self.assertEqual(m.await_count, 2)


class TestSentenceConcurrency(unittest.IsolatedAsyncioTestCase):
    async def test_concurrent_requests_for_one_sentence_both_succeed(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        engine = create_engine(f"sqlite:///{tmp.name}/t.db")
        self.addCleanup(engine.dispose)
        Base.metadata.create_all(bind=engine)
        Session = sessionmaker(bind=engine)
        s1, s2 = Session(), Session()
        self.addCleanup(s1.close)
        self.addCleanup(s2.close)

        async def slow(*_):
            await asyncio.sleep(0.01)  # both requests miss the cache before either commits
            return OK

        with patch("main.method2_libretranslate", new=AsyncMock(side_effect=slow)):
            r1, r2 = await asyncio.gather(translate_sentence("Hallo Welt.", s1), translate_sentence("Hallo Welt.", s2))
        self.assertEqual(r1, r2)
        self.assertEqual(r1["translation"], "He starts tomorrow.")


if __name__ == "__main__":
    unittest.main()
