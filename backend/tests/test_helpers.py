"""Unit tests for the small shared helpers: word_key, sentence_hash, models_to_try and _video_entry."""

import hashlib
import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

from lemmatizer import word_key
from routers.library import _video_entry
from translators.llm import models_to_try
from utils import sentence_hash


class WordKeyTest(unittest.TestCase):
    def test_noun_keeps_capital(self):
        with patch("lemmatizer.analyze", return_value=("Bank", "NOUN", "die")):
            self.assertEqual(word_key("Bank"), ("Bank", "NOUN", "die"))

    def test_other_words_are_lowercased(self):
        with patch("lemmatizer.analyze", return_value=("Gehen", "VERB", None)):
            self.assertEqual(word_key("geht")[0], "gehen")


class SentenceHashTest(unittest.TestCase):
    def test_whitespace_is_normalized(self):
        self.assertEqual(sentence_hash("a  b\n c"), sentence_hash("a b c"))

    def test_is_sha256_of_normalized_text(self):
        self.assertEqual(sentence_hash("a b"), hashlib.sha256(b"a b").hexdigest())


class ModelsToTryTest(unittest.TestCase):
    def test_saved_then_env(self):
        self.assertEqual(models_to_try("a", "b"), ["a", "b"])

    def test_no_duplicates(self):
        self.assertEqual(models_to_try("a", "a"), ["a"])

    def test_missing_values_skipped(self):
        self.assertEqual(models_to_try(None, "b"), ["b"])
        self.assertEqual(models_to_try(None, None), [])


class VideoEntryTest(unittest.TestCase):
    def _video(self, title):
        old = SimpleNamespace(
            id=1,
            created_at=datetime(2024, 1, 1),
            language="de",
            extraction_method="old",
            word_count=1,
        )
        new = SimpleNamespace(
            id=2,
            created_at=datetime(2025, 1, 1),
            language="de",
            extraction_method="new",
            word_count=5,
        )
        return SimpleNamespace(id=9, title=title, url="u", subtitles=[old, new])

    def test_uses_latest_subtitle(self):
        entry = _video_entry(self._video("T"))
        self.assertEqual(
            (entry["id"], entry["video_id"], entry["word_count"]), (2, 9, 5)
        )

    def test_empty_title_becomes_untitled(self):
        self.assertEqual(_video_entry(self._video(None))["title"], "Untitled")
