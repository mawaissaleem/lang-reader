import base64
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import anki
from models import Base, Dictionary, SentenceCard, Translation, UserWord
from tests.test_anki import client_for
from tests.test_anki_outbox import Fake, closed
from tests.test_anki_sentences import Fake as SentenceFake


class AudioTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        self.db = sessionmaker(bind=engine)()
        self.addCleanup(self.db.close)
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.mp3 = Path(tmp.name) / "a.mp3"
        self.mp3.write_bytes(b"MP3DATA")
        self.spoken = []

        async def speak(text):
            self.spoken.append(text)
            return self.mp3

        self.get_audio = patch("anki.tts.get_audio", side_effect=speak)
        self.get_audio.start()
        self.addCleanup(self.get_audio.stop)

    def word(self, german="Haus"):
        d = Dictionary(
            german_word=german, english_meanings=["x"], source="pons", word_class="noun"
        )
        d.translations.append(
            Translation(source="pons", meanings=["x"], word_class="noun")
        )
        self.db.add(d)
        self.db.commit()
        self.db.add(
            UserWord(user_id=1, word_id=d.id, source="pons", anki_status="pending")
        )
        self.db.commit()

    def sentence(self):
        self.db.add(
            SentenceCard(
                user_id=1,
                sentence_de="Das Haus ist groß.",
                sentence_en="Big.",
                target_word="Haus",
                source="AI example",
                anki_status="pending",
            )
        )
        self.db.commit()

    def stored(self, fake):
        return [p for a, p in fake.calls if a == "storeMediaFile"]

    def notes(self, fake):
        return [p["note"] for a, p in fake.calls if a == "addNote"]

    async def test_word_note_gets_audio_with_article_and_stored_file(self):
        self.word("Haus")
        fake = Fake()
        with client_for(fake):
            await anki.send_pending(self.db)
        art = anki.analyze("Haus")[2] or ""
        self.assertEqual(
            self.spoken, [f"{art} Haus".strip()]
        )  # article first, like the play button
        (m,) = self.stored(fake)
        self.assertRegex(m["filename"], r"^reader_haus_[0-9a-f]{10}\.mp3$")
        self.assertEqual(base64.b64decode(m["data"]), b"MP3DATA")
        self.assertEqual(
            self.notes(fake)[0]["fields"]["Audio"], f"[sound:{m['filename']}]"
        )
        self.assertLess(
            fake.actions().index("storeMediaFile"), fake.actions().index("addNote")
        )

    async def test_sentence_note_gets_audio_of_plain_sentence(self):
        self.sentence()
        fake = SentenceFake()
        with client_for(fake):
            await anki.send_pending(self.db)
        self.assertEqual(self.spoken, ["Das Haus ist groß."])  # no <b> tags
        (m,) = self.stored(fake)
        self.assertRegex(m["filename"], r"^reader_s_[0-9a-f]{10}\.mp3$")
        self.assertEqual(
            self.notes(fake)[0]["fields"]["Audio"], f"[sound:{m['filename']}]"
        )

    async def test_tts_failure_still_sends_note_without_audio(self):
        self.word()
        self.get_audio.stop()
        with patch(
            "anki.tts.get_audio", AsyncMock(side_effect=anki.tts.TTSError("boom"))
        ):
            fake = Fake()
            with client_for(fake):
                out = await anki.send_pending(self.db)
        self.assertEqual(out["sent"], 1)
        self.assertEqual(self.stored(fake), [])
        self.assertEqual(self.notes(fake)[0]["fields"]["Audio"], "")
        self.get_audio.start()

    async def test_update_sets_audio_but_omits_it_when_tts_failed(self):
        self.word()
        fake = Fake()
        with client_for(fake):
            await anki.send_pending(self.db)
            self.db.query(UserWord).one().anki_status = "pending"
            await anki.send_pending(self.db)
            upd = [p for a, p in fake.calls if a == "updateNoteFields"][-1]["note"]
            self.assertTrue(upd["fields"]["Audio"].startswith("[sound:reader_haus_"))
            self.db.query(UserWord).one().anki_status = "pending"
            self.get_audio.stop()
            with patch(
                "anki.tts.get_audio", AsyncMock(side_effect=anki.tts.TTSError("boom"))
            ):
                await anki.send_pending(self.db)
            self.get_audio.start()
            upd = [p for a, p in fake.calls if a == "updateNoteFields"][-1]["note"]
        self.assertNotIn("Audio", upd["fields"])

    async def test_pending_note_stays_pending_when_anki_closed(self):
        self.word()
        with client_for(closed), self.assertRaises(anki.AnkiUnreachable):
            await anki.send_pending(self.db)
        self.assertEqual(self.db.query(UserWord).one().anki_status, "pending")

    async def test_case_only_pair_gets_distinct_filenames(self):
        self.word("Essen")
        self.word("essen")
        fake = Fake()
        with client_for(fake):
            await anki.send_pending(self.db)
        a, b = [m["filename"] for m in self.stored(fake)]
        self.assertNotEqual(a.lower(), b.lower())


if __name__ == "__main__":
    unittest.main()
