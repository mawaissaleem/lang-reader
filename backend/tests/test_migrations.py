import os
import sqlite3
import tempfile
import unittest
from pathlib import Path

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect

from database import BASE_DIR, run_migrations
from alembic.config import Config
from models import Base

TABLES = {"videos", "subtitles", "dictionary", "user_words", "texts", "translations"}


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "t.db"
        self.url = f"sqlite:///{self.path}"
        self.head = ScriptDirectory.from_config(
            Config(str(BASE_DIR / "alembic.ini"))
        ).get_current_head()

    @staticmethod
    def make_legacy(eng):
        # a pre-Alembic DB predates the texts and translations tables and subtitles.word_count and user_words.source, .status and the context columns
        Base.metadata.create_all(eng, tables=[t for n, t in Base.metadata.tables.items() if n not in ("texts", "translations", "sentence_translations")])
        with eng.begin() as c:
            c.exec_driver_sql("alter table subtitles drop column word_count")
            c.exec_driver_sql("alter table user_words drop column source")
            c.exec_driver_sql("alter table user_words drop column status")
            for col in ("context_sentence", "text_kind", "text_id"):
                c.exec_driver_sql(f"alter table user_words drop column {col}")

    def version(self):
        with sqlite3.connect(self.path) as c:
            return c.execute("select version_num from alembic_version").fetchone()[0]

    def test_fresh_db_upgrades_to_head(self):
        run_migrations(self.url)
        self.assertTrue(TABLES <= set(inspect(create_engine(self.url)).get_table_names()))
        self.assertEqual(self.version(), self.head)

    def test_legacy_db_is_stamped_and_keeps_rows(self):
        eng = create_engine(self.url)
        self.make_legacy(eng)
        with eng.begin() as c:
            c.exec_driver_sql("insert into videos (url, title) values ('u', 't')")
            c.exec_driver_sql(
                "insert into dictionary (german_word, english_meanings, source) values ('Haus', '[\"house\"]', 'seed')"
            )
        eng.dispose()
        run_migrations(self.url)
        self.assertEqual(self.version(), self.head)
        with sqlite3.connect(self.path) as c:
            self.assertEqual(c.execute("select count(*) from videos").fetchone()[0], 1)
            self.assertEqual(c.execute("select german_word from dictionary").fetchone()[0], "Haus")

    def test_legacy_db_missing_a_table_gets_it_created(self):
        eng = create_engine(self.url)
        self.make_legacy(eng)
        with eng.begin() as c:
            c.exec_driver_sql("insert into videos (url, title) values ('u', 't')")
            c.exec_driver_sql("drop table user_words")
        eng.dispose()
        run_migrations(self.url)
        self.assertIn("user_words", inspect(create_engine(self.url)).get_table_names())
        with sqlite3.connect(self.path) as c:
            self.assertEqual(c.execute("select count(*) from videos").fetchone()[0], 1)

    def test_migrated_schema_matches_models(self):
        run_migrations(self.url)
        with create_engine(self.url).connect() as conn:
            diff = compare_metadata(MigrationContext.configure(conn), Base.metadata)
        self.assertEqual(diff, [])

    def test_0003_backfills_subtitle_word_count(self):
        from alembic import command

        cfg = Config(str(BASE_DIR / "alembic.ini"))
        cfg.set_main_option("sqlalchemy.url", self.url)
        command.upgrade(cfg, "0002")
        txt = Path(self.tmp.name) / "a.txt"
        txt.write_text("eins zwei  drei\nvier", encoding="utf-8")
        with sqlite3.connect(self.path) as c:
            c.execute("insert into videos (id, url) values (1, 'u')")
            c.execute("insert into subtitles (video_id, extraction_method, txt_path) values (1, 'x', ?)", (str(txt),))
            c.execute("insert into subtitles (video_id, extraction_method, txt_path) values (1, 'x', '/nope/missing.txt')")
        command.upgrade(cfg, "head")
        with sqlite3.connect(self.path) as c:
            rows = c.execute("select word_count from subtitles order by id").fetchall()
        self.assertEqual(rows, [(4,), (0,)])

    def test_0003_backfill_resolves_relative_paths_from_another_cwd(self):
        from alembic import command

        cfg = Config(str(BASE_DIR / "alembic.ini"))
        cfg.set_main_option("sqlalchemy.url", self.url)
        command.upgrade(cfg, "0002")
        rel = Path("_mig_test_rel.txt")
        (BASE_DIR / rel).write_text("eins zwei drei", encoding="utf-8")
        self.addCleanup((BASE_DIR / rel).unlink)
        with sqlite3.connect(self.path) as c:
            c.execute("insert into videos (id, url) values (1, 'u')")
            c.execute("insert into subtitles (video_id, extraction_method, txt_path) values (1, 'x', ?)", (str(rel),))
        old = os.getcwd()
        self.addCleanup(os.chdir, old)
        os.chdir(self.tmp.name)
        command.upgrade(cfg, "head")
        with sqlite3.connect(self.path) as c:
            self.assertEqual(c.execute("select word_count from subtitles").fetchall(), [(3,)])

    def test_0004_copies_dictionary_into_translations(self):
        from alembic import command

        cfg = Config(str(BASE_DIR / "alembic.ini"))
        cfg.set_main_option("sqlalchemy.url", self.url)
        command.upgrade(cfg, "0003")
        with sqlite3.connect(self.path) as c:
            c.execute(
                "insert into dictionary (german_word, english_meanings, word_class, source, raw_response) "
                "values ('haus', '[\"house\"]', 'noun', 'pons', '{\"a\": 1}'), ('tee', '[\"tea\"]', null, 'seed', null)"
            )
        command.upgrade(cfg, "head")
        with sqlite3.connect(self.path) as c:
            rows = c.execute(
                "select d.german_word, t.source, t.meanings, t.word_class, t.raw_response "
                "from translations t join dictionary d on d.id = t.word_id order by d.id"
            ).fetchall()
        self.assertEqual(
            rows,
            [("haus", "pons", '["house"]', "noun", '{"a": 1}'), ("tee", "seed", '["tea"]', None, None)],
        )
        command.downgrade(cfg, "0003")
        self.assertNotIn("translations", inspect(create_engine(self.url)).get_table_names())

    def test_0005_adds_nullable_user_word_source(self):
        from alembic import command

        cfg = Config(str(BASE_DIR / "alembic.ini"))
        cfg.set_main_option("sqlalchemy.url", self.url)
        command.upgrade(cfg, "0004")
        with sqlite3.connect(self.path) as c:
            c.execute("insert into dictionary (id, german_word, english_meanings, source) values (1, 'haus', '[]', 'pons')")
            c.execute("insert into user_words (user_id, word_id) values (1, 1)")
        command.upgrade(cfg, "0005")
        cols = {c["name"]: c for c in inspect(create_engine(self.url)).get_columns("user_words")}
        self.assertTrue(cols["source"]["nullable"])
        with sqlite3.connect(self.path) as c:
            self.assertEqual(c.execute("select source from user_words").fetchall(), [(None,)])
        command.downgrade(cfg, "0004")
        self.assertNotIn("source", [c["name"] for c in inspect(create_engine(self.url)).get_columns("user_words")])

    def test_0006_existing_user_words_become_known(self):
        from alembic import command

        cfg = Config(str(BASE_DIR / "alembic.ini"))
        cfg.set_main_option("sqlalchemy.url", self.url)
        command.upgrade(cfg, "0005")
        with sqlite3.connect(self.path) as c:
            c.execute("insert into dictionary (id, german_word, english_meanings, source) values (1, 'haus', '[]', 'pons')")
            c.execute("insert into user_words (user_id, word_id) values (1, 1)")
        command.upgrade(cfg, "0006")
        with sqlite3.connect(self.path) as c:
            self.assertEqual(c.execute("select status from user_words").fetchall(), [("known",)])
        command.downgrade(cfg, "0005")
        self.assertNotIn("status", [c["name"] for c in inspect(create_engine(self.url)).get_columns("user_words")])

    def test_0007_adds_nullable_context_columns(self):
        from alembic import command

        cfg = Config(str(BASE_DIR / "alembic.ini"))
        cfg.set_main_option("sqlalchemy.url", self.url)
        command.upgrade(cfg, "0006")
        with sqlite3.connect(self.path) as c:
            c.execute("insert into dictionary (id, german_word, english_meanings, source) values (1, 'haus', '[]', 'pons')")
            c.execute("insert into user_words (user_id, word_id) values (1, 1)")
        command.upgrade(cfg, "0007")
        with sqlite3.connect(self.path) as c:
            self.assertEqual(c.execute("select context_sentence, text_kind, text_id from user_words").fetchall(), [(None, None, None)])
        command.downgrade(cfg, "0006")
        cols = [c["name"] for c in inspect(create_engine(self.url)).get_columns("user_words")]
        self.assertNotIn("context_sentence", cols)

    def test_0008_creates_sentence_translations(self):
        from alembic import command

        cfg = Config(str(BASE_DIR / "alembic.ini"))
        cfg.set_main_option("sqlalchemy.url", self.url)
        command.upgrade(cfg, "0007")
        self.assertNotIn("sentence_translations", inspect(create_engine(self.url)).get_table_names())
        command.upgrade(cfg, "0008")
        self.assertIn("sentence_translations", inspect(create_engine(self.url)).get_table_names())
        command.downgrade(cfg, "0007")
        self.assertNotIn("sentence_translations", inspect(create_engine(self.url)).get_table_names())

    def test_rerun_is_noop(self):
        run_migrations(self.url)
        run_migrations(self.url)
        self.assertEqual(self.version(), self.head)


if __name__ == "__main__":
    unittest.main()
