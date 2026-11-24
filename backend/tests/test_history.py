import os
import sqlite3
import sys
import tempfile
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import anki
import history
import main
from routers import words
import database
from database import run_migrations
from models import Base, Dictionary, UserWord, WordEvent

UTC = ZoneInfo("UTC")


def at(s):
    return datetime.fromisoformat(s)  # naive, like sqlite returns


class Base_(unittest.TestCase):
    def setUp(self):
        engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine)()
        self.addCleanup(self.db.close)

    def word(self, lemma="Haus", status="learning1"):
        d = Dictionary(german_word=lemma, english_meanings=[], source="pons")
        self.db.add(d)
        self.db.flush()
        uw = UserWord(user_id=1, word_id=d.id, status=status)
        self.db.add(uw)
        self.db.commit()
        return uw

    def event(self, word_id, status, when):
        self.db.add(WordEvent(user_id=1, word_id=word_id, status=status, at=at(when)))
        self.db.commit()


class TestWriters(Base_):
    def test_set_status_logs_once_and_skips_noop(self):
        uw = self.word()
        self.assertTrue(history.set_status(self.db, uw, "known"))
        self.assertFalse(history.set_status(self.db, uw, "known"))
        self.db.commit()
        self.assertEqual([e.status for e in self.db.query(WordEvent)], ["known"])

    def test_patch_endpoint_and_save_write_events(self):
        uw = self.word()
        main.app.dependency_overrides[database.get_db] = lambda: self.db
        self.addCleanup(main.app.dependency_overrides.clear)
        r = TestClient(main.app).patch(
            f"/user-words/{uw.id}/status", json={"status": "known"}
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual([e.status for e in self.db.query(WordEvent)], ["known"])

    def test_resaving_a_word_writes_no_event(self):
        import asyncio

        d = Dictionary(german_word="Baum", english_meanings=[], source="pons")
        self.db.add(d)
        self.db.commit()
        asyncio.run(words.save_word(d.id, 1, db=self.db))
        asyncio.run(words.save_word(d.id, 1, db=self.db))
        self.assertEqual(self.db.query(WordEvent).count(), 1)

    def test_save_word_logs_learning1(self):
        import asyncio

        d = Dictionary(german_word="Baum", english_meanings=[], source="pons")
        self.db.add(d)
        self.db.commit()
        asyncio.run(words.save_word(d.id, 1, db=self.db))
        self.assertEqual(
            [(e.word_id, e.status) for e in self.db.query(WordEvent)],
            [(d.id, "learning1")],
        )

    def test_anki_pull_logs_promotion(self):
        uw = self.word(status="learning1")
        uw.anki_note_id = 5

        async def fake(action, **kw):
            if action == "notesInfo":
                return [
                    {
                        "noteId": 5,
                        "modelName": "Reader Word",
                        "fields": {"Lemma": {"value": "Haus"}},
                        "cards": [9],
                    }
                ]
            return [{"cardId": 9, "interval": 400}]

        import asyncio

        with patch("anki.invoke", side_effect=fake):
            asyncio.run(anki.pull_intervals(self.db, 1))
        self.assertEqual([e.status for e in self.db.query(WordEvent)], ["known"])

    def test_anki_import_logs_known(self):
        async def fake(action, **kw):
            return {"modelFieldNames": ["Front"], "findNotes": [1]}.get(action) or [
                {"fields": {"Front": {"value": "Haus"}}}
            ]

        import asyncio

        with patch("anki.invoke", side_effect=fake):
            asyncio.run(
                anki.import_known(
                    self.db, 1, {"decks": ["d"], "model": "m", "field": "Front"}
                )
            )
        self.assertEqual([e.status for e in self.db.query(WordEvent)], ["known"])


class TestProgress(Base_):
    def prog(self, today, tz=UTC):
        return history.build_progress(self.db, 1, tz, today)

    def test_cumulative_series_with_untracked_baseline(self):
        a, b, c = (
            self.word("a", "known"),
            self.word("b", "known"),
            self.word("c", "known"),
        )
        self.word("d", "learning1")
        self.event(a.word_id, "known", "2026-11-10T12:00")
        self.event(b.word_id, "known", "2026-11-10T13:00")
        self.event(
            c.word_id, "learning1", "2026-11-01T12:00"
        )  # c is known now but no dated known event: before tracking
        p = self.prog(date(2026, 11, 12))
        self.assertEqual(
            (p["known"], p["before"], p["days"]), (3, 1, [["2026-11-10", 3]])
        )

    def test_word_moved_off_known_not_counted(self):
        a = self.word("a", "learning2")
        self.event(a.word_id, "known", "2026-11-10T12:00")
        self.assertEqual(self.prog(date(2026, 11, 12))["days"], [])

    def test_streak_today_without_activity_keeps_yesterdays_run(self):
        for d in ("2026-11-14", "2026-11-15", "2026-11-16"):
            self.event(1, "learning1", d + "T10:00")
        self.assertEqual(
            self.prog(date(2026, 11, 17))["streak"], {"current": 3, "longest": 3}
        )

    def test_streak_broken_by_gap_and_longest_kept(self):
        for d in ("2026-11-01", "2026-11-02", "2026-11-03", "2026-11-10"):
            self.event(1, "learning1", d + "T10:00")
        self.assertEqual(
            self.prog(date(2026, 11, 17))["streak"], {"current": 0, "longest": 3}
        )
        self.assertEqual(self.prog(date(2026, 11, 10))["streak"]["current"], 1)

    def test_no_activity(self):
        self.assertEqual(
            self.prog(date(2026, 11, 17))["streak"], {"current": 0, "longest": 0}
        )

    def test_days_use_callers_timezone(self):
        self.event(1, "learning1", "2026-11-16T23:30")  # 00:30 on the 17th in Berlin
        self.event(1, "learning1", "2026-11-17T10:00")
        berlin, la = ZoneInfo("Europe/Berlin"), ZoneInfo("America/Los_Angeles")
        self.assertEqual(
            self.prog(date(2026, 11, 17), berlin)["streak"]["longest"], 1
        )  # both on the 17th
        self.assertEqual(self.prog(date(2026, 11, 17), UTC)["streak"]["longest"], 2)
        self.assertEqual(
            self.prog(date(2026, 11, 17), la)["streak"]["longest"], 2
        )  # 15:30 on the 16th, 02:00 on the 17th

    def test_today_uses_local_day_and_default_goal(self):
        self.event(1, "learning1", "2026-11-16T23:30")  # 00:30 on the 17th in Berlin
        self.event(2, "learning1", "2026-11-17T10:00")
        p = self.prog(date(2026, 11, 17), ZoneInfo("Europe/Berlin"))
        self.assertEqual((p["today"], p["goal"]), (2, 25))
        self.assertEqual(self.prog(date(2026, 11, 17), UTC)["today"], 1)

    def test_today_counts_a_new_save(self):
        self.event(1, "learning1", "2026-11-17T10:00")
        self.assertEqual(self.prog(date(2026, 11, 17))["today"], 1)

    def test_today_counts_a_level_up_of_an_older_word(self):
        self.event(1, "learning1", "2026-11-10T10:00")
        self.event(1, "learning2", "2026-11-17T10:00")
        self.assertEqual(self.prog(date(2026, 11, 17))["today"], 1)

    def test_today_skips_a_downgrade(self):
        self.event(1, "known", "2026-11-10T10:00")
        self.event(1, "learning2", "2026-11-17T10:00")
        self.assertEqual(self.prog(date(2026, 11, 17))["today"], 0)

    def test_today_skips_ignored(self):
        self.event(1, "learning1", "2026-11-10T10:00")
        self.event(1, "ignored", "2026-11-17T10:00")
        self.event(2, "ignored", "2026-11-17T11:00")  # first event straight to ignored
        self.assertEqual(self.prog(date(2026, 11, 17))["today"], 0)

    def test_today_counts_a_word_changed_twice_once(self):
        self.event(1, "learning1", "2026-11-17T10:00")
        self.event(1, "known", "2026-11-17T11:00")
        self.assertEqual(self.prog(date(2026, 11, 17))["today"], 1)

    def test_saved_per_day_counts_distinct_words_in_local_days(self):
        self.event(1, "learning1", "2026-11-16T23:30")  # 00:30 on the 17th in Berlin
        self.event(1, "learning2", "2026-11-17T09:00")  # same word, same day
        self.event(2, "learning1", "2026-11-10T09:00")
        self.event(3, "ignored", "2026-11-10T09:00")  # ignoring is not progress
        p = self.prog(date(2026, 11, 17), ZoneInfo("Europe/Berlin"))
        self.assertEqual(p["saved"], [["2026-11-10", 1], ["2026-11-17", 1]])
        self.assertEqual(p["today"], 1)

    def test_week_gain_counts_words_that_reached_known_in_the_window(self):
        old = self.word("old", "known")  # known long before the window
        self.event(old.word_id, "known", "2026-11-01T09:00")
        undated = self.word("undated", "known")  # known, no events at all
        new = self.word("new", "known")
        self.event(new.word_id, "learning1", "2026-11-05T09:00")
        self.event(new.word_id, "known", "2026-11-15T09:00")
        self.assertEqual(self.prog(date(2026, 11, 17))["week_gain"], 1)
        self.assertEqual(undated.status, "known")

    def test_week_gain_ignores_a_word_that_went_known_then_back_down(self):
        a = self.word("a", "learning2")
        self.event(a.word_id, "known", "2026-11-14T09:00")
        self.event(a.word_id, "learning2", "2026-11-15T09:00")
        self.assertEqual(self.prog(date(2026, 11, 17))["week_gain"], 0)

    def test_week_gain_is_negative_when_a_known_word_dropped(self):
        a = self.word("a", "learning1")
        self.event(a.word_id, "known", "2026-11-01T09:00")
        self.event(a.word_id, "learning1", "2026-11-15T09:00")
        self.assertEqual(self.prog(date(2026, 11, 17))["week_gain"], -1)

    def test_week_gain_boundary_uses_callers_timezone(self):
        a = self.word("a", "known")
        # 23:30 UTC on the 10th is 12:30 on the 11th in Auckland: after the cutoff on the 10th
        self.event(a.word_id, "known", "2026-11-10T23:30")
        auckland = ZoneInfo("Pacific/Auckland")
        self.assertEqual(self.prog(date(2026, 11, 17), auckland)["week_gain"], 1)
        # in UTC that event is on the 10th, the last day before the window
        self.assertEqual(self.prog(date(2026, 11, 17), UTC)["week_gain"], 0)

    def test_goal_endpoint_saves_and_rejects_bad_values(self):
        main.app.dependency_overrides[database.get_db] = lambda: self.db
        self.addCleanup(main.app.dependency_overrides.clear)
        c = TestClient(main.app)
        self.assertEqual(c.put("/progress/goal", json={"goal": 40}).status_code, 200)
        self.assertEqual(c.get("/progress").json()["goal"], 40)
        self.assertEqual(c.put("/progress/goal", json={"goal": 0}).status_code, 422)

    def test_endpoint_ok_and_bad_tz(self):
        main.app.dependency_overrides[database.get_db] = lambda: self.db
        self.addCleanup(main.app.dependency_overrides.clear)
        c = TestClient(main.app)
        self.assertEqual(
            c.get("/progress?user_id=1&tz=Europe/Berlin").json()["streak"]["current"], 0
        )
        self.assertEqual(c.get("/progress?tz=Nope/Zone").status_code, 400)


class TestMigration(unittest.TestCase):
    def test_backfill_uses_added_at_and_skips_undated(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "t.db"
            url = f"sqlite:///{path}"
            from alembic import command
            from alembic.config import Config
            from database import BASE_DIR

            cfg = Config(str(BASE_DIR / "alembic.ini"))
            cfg.set_main_option("sqlalchemy.url", url)
            command.upgrade(cfg, "0012")
            with sqlite3.connect(path) as c:
                c.execute(
                    "insert into dictionary (german_word, english_meanings, source) values ('a','[]','x'),('b','[]','x')"
                )
                c.execute(
                    "insert into user_words (user_id, word_id, status, added_at, is_mastered, review_count, anki_status) values (1,1,'known','2026-01-05 10:00:00',0,0,'none')"
                )
                c.execute(
                    "insert into user_words (user_id, word_id, status, added_at, is_mastered, review_count, anki_status) values (1,2,'known',NULL,0,0,'none')"
                )
            command.upgrade(cfg, "head")
            with sqlite3.connect(path) as c:
                rows = c.execute(
                    "select word_id, status, at from word_events"
                ).fetchall()
            self.assertEqual(rows, [(1, "known", "2026-01-05 10:00:00")])


if __name__ == "__main__":
    unittest.main()
