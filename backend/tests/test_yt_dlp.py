import os
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from extractors.yt_dlp import method2_yt_dlp


def fake_ydl(info, downloaded):
    """YoutubeDL class mock: 1st instance returns info, 2nd the download result."""
    instances = []

    def factory(opts):
        m = MagicMock()
        m.__enter__.return_value = m
        m.extract_info.return_value = info if not instances else downloaded
        m.opts = opts
        instances.append(m)
        return m

    return factory, instances


class YtDlpTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        cwd = os.getcwd()
        self.addCleanup(os.chdir, cwd)
        os.chdir(self.tmp.name)
        os.makedirs("subtitles")
        open("subtitles/stale.vtt", "w").close()
        self.info = {"title": "T", "subtitles": {}, "automatic_captions": {"de-DE": []}}

    def run_with(self, downloaded):
        factory, instances = fake_ydl(self.info, downloaded)
        with patch("yt_dlp.YoutubeDL", side_effect=factory):
            return method2_yt_dlp("http://x"), instances

    def test_only_de_de_downloads_that_lang_and_returns_reported_path(self):
        new = os.path.abspath("subtitles/new.de-DE.vtt")
        open(new, "w").close()
        res, inst = self.run_with({"requested_subtitles": {"de-DE": {"filepath": new}}})
        self.assertEqual(inst[1].opts["subtitleslangs"], ["de-DE"])
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["vtt_path"], new)
        self.assertIn("%(id)s", inst[1].opts["outtmpl"])
        self.assertNotIn("%(title)s", inst[1].opts["outtmpl"])

    def test_no_reported_file_is_not_found(self):
        res, _ = self.run_with({"requested_subtitles": None})
        self.assertEqual(res["status"], "not_found")
        self.assertIsNone(res["vtt_path"])

    def test_prefers_manual_over_auto(self):
        self.info = {
            "title": "T",
            "subtitles": {"de-DE": []},
            "automatic_captions": {"de": []},
        }
        _, inst = self.run_with({"requested_subtitles": None})
        self.assertEqual(inst[1].opts["subtitleslangs"], ["de-DE"])


if __name__ == "__main__":
    unittest.main()
