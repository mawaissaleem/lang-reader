import os
import sqlite3
import sys
import tempfile
import unittest
import zipfile

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import anki
import main
from database import get_db
from models import Base, Dictionary, Translation, UserWord


def read_notes(path):
    with tempfile.TemporaryDirectory() as d:
        zipfile.ZipFile(path).extractall(d)
        con = sqlite3.connect(os.path.join(d, "collection.anki2"))
        rows = con.execute(
            "select guid, flds, tags from notes order by guid"
        ).fetchall()
        con.close()
        return rows


class ExportTest(unittest.TestCase):
    def setUp(self):
        engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(bind=engine)
        self.db = sessionmaker(bind=engine)()
        for i, (word, status) in enumerate(
            [("Haus", "pending"), ("Baum", "sent"), ("Tisch", "none")]
        ):
            d = Dictionary(german_word=word, english_meanings=["x"], source="pons")
            d.translations.append(Translation(source="pons", meanings=["x"]))
            self.db.add(d)
            self.db.flush()
            self.db.add(
                UserWord(
                    user_id=1,
                    word_id=d.id,
                    anki_status=status,
                    context_sentence=f"Das ist {word}.",
                )
            )
        self.db.commit()
        main.app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(main.app)

    def tearDown(self):
        main.app.dependency_overrides.clear()
        self.db.close()

    def build(self):
        with tempfile.NamedTemporaryFile(suffix=".apkg") as f:
            n = anki.export_apkg(self.db, 1, f.name)
            return n, read_notes(f.name)

    def test_guids_are_stable_across_exports(self):
        n1, a = self.build()
        n2, b = self.build()
        self.assertEqual(n1, 2)  # "none" (e.g. imported known) words are left out
        self.assertEqual([r[0] for r in a], [r[0] for r in b])
        self.assertEqual(len({r[0] for r in a}), 2)

    def test_endpoint_downloads_apkg(self):
        r = self.client.get("/anki/export.apkg", params={"user_id": 1})
        self.assertEqual(r.status_code, 200)
        self.assertIn("lang-reader.apkg", r.headers["content-disposition"])
        self.assertTrue(r.content.startswith(b"PK"))

    def test_endpoint_requires_user_id(self):
        self.assertEqual(self.client.get("/anki/export.apkg").status_code, 422)
