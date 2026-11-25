import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from extractors.yt_dlp import base_options, method2_yt_dlp


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
        patcher = patch("extractors.yt_dlp.BASE_DIR", Path(self.tmp.name))
        patcher.start()
        self.addCleanup(patcher.stop)
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


class BaseOptionsTest(unittest.TestCase):
    def options(self, env, which="/usr/local/bin/node"):
        with patch.dict(os.environ, env, clear=True):
            with patch("extractors.yt_dlp.shutil.which", return_value=which):
                return base_options()

    def test_defaults_use_firefox_and_node_from_path(self):
        opts = self.options({})
        self.assertEqual(opts["cookiesfrombrowser"], ("firefox",))
        runtimes = opts["extractor_args"]["youtube"]["js_runtimes"]
        self.assertEqual(runtimes, ["node:/usr/local/bin/node"])

    def test_custom_browser(self):
        opts = self.options({"YTDLP_COOKIES_BROWSER": "chrome"})
        self.assertEqual(opts["cookiesfrombrowser"], ("chrome",))

    def test_empty_browser_means_no_cookies(self):
        self.assertNotIn(
            "cookiesfrombrowser", self.options({"YTDLP_COOKIES_BROWSER": ""})
        )

    def test_custom_node_path_beats_path_lookup(self):
        opts = self.options({"YTDLP_NODE": "/opt/node/bin/node"})
        runtimes = opts["extractor_args"]["youtube"]["js_runtimes"]
        self.assertEqual(runtimes, ["node:/opt/node/bin/node"])

    def test_no_node_means_no_js_runtime(self):
        self.assertNotIn("extractor_args", self.options({}, which=None))
