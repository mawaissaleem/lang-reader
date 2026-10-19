import os
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from extractors.transcript_api import method1_youtube_transcript_api


class TranscriptApiFilenameTest(unittest.TestCase):
    def test_same_title_different_ids_make_different_files(self):
        snippet = MagicMock(start=0.0, duration=1.0, text="Hallo")
        transcript = MagicMock(language="German", is_generated=False)
        transcript.fetch.return_value = MagicMock(snippets=[snippet])
        api = MagicMock()
        api.list.return_value.find_transcript.return_value = transcript

        with tempfile.TemporaryDirectory() as tmp:
            cwd = os.getcwd()
            self.addCleanup(os.chdir, cwd)
            os.chdir(tmp)
            open("cookies.txt", "w").close()
            with patch("extractors.transcript_api.YouTubeTranscriptApi", return_value=api), \
                 patch("extractors.transcript_api.load_cookies_session"), \
                 patch("extractors.transcript_api.get_video_title", return_value="Folge 1"):
                a = method1_youtube_transcript_api("https://www.youtube.com/watch?v=aaaaaaaaaaa")
                b = method1_youtube_transcript_api("https://www.youtube.com/watch?v=bbbbbbbbbbb")

            self.assertNotEqual(a["vtt_path"], b["vtt_path"])
            self.assertTrue(os.path.isfile(a["vtt_path"]))
            self.assertTrue(os.path.isfile(b["vtt_path"]))
            self.assertEqual(os.path.basename(a["vtt_path"]), "aaaaaaaaaaa.de.vtt")
            self.assertEqual(a["video_title"], b["video_title"])


if __name__ == "__main__":
    unittest.main()
