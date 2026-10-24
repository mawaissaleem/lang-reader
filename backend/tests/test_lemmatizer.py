import os
import sys
import unittest
from unittest.mock import AsyncMock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import lemmatizer
from models import Base, Dictionary, Translation, UserWord
from main import lookup_word, save_word


class TestLemmatize(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        lemmatizer.load_model()  # real local model, no network
        if lemmatizer.nlp is None:
            raise unittest.SkipTest("de_core_news_sm not installed")

    def test_inflected_verbs_resolve_to_gehen(self):
        # sentences, not bare words: the small model needs context
        for word, sentence in [
            ("ging", "Ich ging nach Hause."),
            ("gehst", "Du gehst nach Hause."),
            ("gegangen", "Ich bin gegangen."),
        ]:
            self.assertEqual(lemmatizer.lemmatize(word, sentence), "gehen", word)

    def test_separable_verb_and_particle_merge(self):
        for phrase, sentence, lemma in [
            ("fängt an", "Er fängt morgen an.", "anfangen"),
            ("fangen an", "Wir fangen jetzt an.", "anfangen"),
            ("ruft an", "Sie ruft ihn an.", "anrufen"),
            ("steht auf", "Er steht früh auf.", "aufstehen"),
        ]:
            self.assertEqual(lemmatizer.lemmatize(phrase, sentence), lemma, phrase)

    def test_other_phrase_stays_as_written(self):
        self.assertEqual(lemmatizer.lemmatize("rote Bank", "Die rote Bank ist alt."), "rote Bank")

    def test_stem_changing_verbs_are_not_made_up(self):
        for word, sentence, ok in [
            ("isst", "Er isst einen Apfel.", {"isst", "essen"}),
            ("gibst", "Du gibst mir das Buch.", {"geben"}),
            ("muss", "Ich muss arbeiten.", {"muss", "müssen"}),
            ("weißt", "Du weißt es.", {"wissen"}),
        ]:
            self.assertIn(lemmatizer.lemmatize(word, sentence), ok, word)

    def test_base_forms_are_not_remapped(self):
        # the table maps sein -> mein, führen -> fahren; infinitive and wir/sie forms are already the base form
        for word, sentence, base in [
            ("sein", "Das kann sein.", "sein"),
            ("führen", "Wir führen ein Gespräch.", "führen"),
            ("spielen", "Sie spielen Fußball.", "spielen"),
            ("gegessen", "Wir haben gegessen.", "essen"),
            ("gingen", "Sie gingen nach Hause.", "gehen"),
        ]:
            self.assertEqual(lemmatizer.lemmatize(word, sentence), base, word)

    def test_capitalized_verb_uses_lowercase_form(self):
        self.assertEqual(lemmatizer.lemmatize("Habe", "Habe ich das gesagt?"), "haben")

    def test_missing_table_keeps_clicked_verb(self):
        with patch.object(lemmatizer, "lookup", {}):
            self.assertEqual(lemmatizer.lemmatize("gibst", "Du gibst mir das Buch."), "gibst")

    def test_bare_word_without_sentence(self):
        self.assertEqual(lemmatizer.lemmatize("ging"), "gehen")

    def test_nouns_keep_capitalization(self):
        self.assertEqual(lemmatizer.lemmatize("Häuser", "Die Häuser sind groß."), "Haus")

    def test_case_insensitive_match_in_sentence(self):
        self.assertEqual(lemmatizer.lemmatize("haus", "Das Haus ist alt."), "Haus")

    def test_word_missing_from_sentence_falls_back_to_word_alone(self):
        self.assertEqual(lemmatizer.lemmatize("ging", "Das ist ein Satz."), "gehen")

    def test_noun_article_from_gender(self):
        for word, sentence, expected in [
            ("Tisch", "Der Tisch ist groß.", ("Tisch", "NOUN", "der")),
            ("Bank", "Ich gehe zur Bank.", ("Bank", "NOUN", "die")),
            ("Essen", "Das Essen ist gut.", ("Essen", "NOUN", "das")),
        ]:
            self.assertEqual(lemmatizer.analyze(word, sentence), expected, word)

    def test_verb_has_no_article(self):
        self.assertEqual(lemmatizer.analyze("essen", "Wir essen Brot.")[1:], ("VERB", None))


class TestNoModel(unittest.TestCase):
    def test_missing_model_returns_clicked_word(self):
        with patch.object(lemmatizer, "nlp", None):
            self.assertEqual(lemmatizer.lemmatize("ging", "Ich ging."), "ging")

    def test_load_failure_does_not_raise(self):
        with patch.object(lemmatizer, "nlp", None), patch.dict(sys.modules, {"spacy": None}):
            lemmatizer.load_model()
            self.assertIsNone(lemmatizer.nlp)

    def test_missing_table_file_does_not_raise(self):
        with patch.object(lemmatizer, "lookup", {}), patch.object(lemmatizer, "LOOKUP_PATH", "/nonexistent.json.gz"):
            lemmatizer.load_model()
            self.assertEqual(lemmatizer.lookup, {})


class TestLookupUsesLemma(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        lemmatizer.load_model()
        if lemmatizer.nlp is None:
            raise unittest.SkipTest("de_core_news_sm not installed")

    async def test_lookup_caches_and_returns_lemma(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        db = sessionmaker(bind=engine)()
        self.addCleanup(db.close)
        pons = AsyncMock(return_value={"success": True, "word": "gehen", "translations": ["go"],
                                       "word_class": "verb", "source": "pons", "raw_response": {}})
        with patch("main.method1_pons", pons):
            r = await lookup_word("ging", user_id=1, priority="pons", sentence="Ich ging nach Hause.", db=db)
        self.assertEqual((r["word"], r["clicked"]), ("gehen", "ging"))
        self.assertEqual(pons.await_args.args[0], "gehen")
        self.assertEqual(db.query(Dictionary).one().german_word, "gehen")

    async def test_selected_phrase_looks_up_merged_verb(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        db = sessionmaker(bind=engine)()
        self.addCleanup(db.close)
        pons = AsyncMock(return_value={"success": True, "word": "anfangen", "translations": ["begin"],
                                       "word_class": "verb", "source": "pons", "raw_response": {}})
        with patch("main.method1_pons", pons):
            r = await lookup_word("fängt an", user_id=1, priority="pons", sentence="Er fängt morgen an.", db=db)
        self.assertEqual((r["word"], r["clicked"]), ("anfangen", "fängt an"))
        self.assertEqual(pons.await_args.args[0], "anfangen")

    async def test_noun_and_verb_stay_separate_entries_and_saves(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        db = sessionmaker(bind=engine)()
        self.addCleanup(db.close)
        pons = AsyncMock(return_value={"success": True, "translations": ["food"], "word_class": "noun",
                                       "source": "pons", "raw_response": {}})
        with patch("main.method1_pons", pons):
            noun = await lookup_word("Essen", user_id=1, priority="pons", sentence="Das Essen ist gut.", db=db)
            verb = await lookup_word("essen", user_id=1, priority="pons", sentence="Wir essen Brot.", db=db)
        self.assertEqual((noun["word"], noun["article"]), ("Essen", "das"))
        self.assertEqual((verb["word"], verb["article"]), ("essen", None))
        self.assertNotEqual(noun["id"], verb["id"])
        for r in (noun, verb):
            await save_word(r["id"], user_id=1, db=db)
        self.assertEqual(db.query(UserWord).count(), 2)

    async def test_noun_adopts_legacy_lowercase_row(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        db = sessionmaker(bind=engine)()
        self.addCleanup(db.close)
        old = Dictionary(german_word="tisch", english_meanings=["table"], source="pons", word_class="Nomen")
        old.translations.append(Translation(source="pons", meanings=["table"]))
        db.add(old)
        db.commit()
        pons = AsyncMock()
        with patch("main.method1_pons", pons):
            r = await lookup_word("Tisch", user_id=1, priority="pons", sentence="Der Tisch ist groß.", db=db)
        pons.assert_not_awaited()
        self.assertEqual((r["id"], r["word"], r["article"]), (old.id, "Tisch", "der"))
        self.assertEqual(db.query(Dictionary).count(), 1)

    async def test_noun_leaves_saved_lowercase_verb_row_alone(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=engine)
        db = sessionmaker(bind=engine)()
        self.addCleanup(db.close)
        old = Dictionary(german_word="gehen", english_meanings=["go"], source="pons", word_class="verb")
        old.translations.append(Translation(source="pons", meanings=["go"]))
        db.add(old)
        db.commit()
        await save_word(old.id, user_id=1, db=db)
        pons = AsyncMock(return_value={"success": True, "translations": ["walking"], "word_class": "noun",
                                       "source": "pons", "raw_response": {}})
        with patch("main.method1_pons", pons):
            r = await lookup_word("Gehen", user_id=1, priority="pons", sentence="Das Gehen fällt ihm schwer.", db=db)
        self.assertEqual(r["word"], "Gehen")
        self.assertNotEqual(r["id"], old.id)
        self.assertEqual(db.query(UserWord).one().word.german_word, "gehen")
        self.assertEqual(db.query(Dictionary).count(), 2)


if __name__ == "__main__":
    unittest.main()
