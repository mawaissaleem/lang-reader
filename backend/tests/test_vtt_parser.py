import os
import tempfile
import unittest

from vtt_parser import extract_cues, extract_subtitles


def run(cues):
    out = ["WEBVTT", ""]
    for i, text in enumerate(cues):
        out += [f"00:00:{i:02d}.000 --> 00:00:{i:02d}.900", text, ""]
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "a.vtt")
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(out))
        return extract_subtitles(path)


class ExtractSubtitlesTest(unittest.TestCase):
    def test_rolling_duplicates_removed(self):
        res = run(["line A\nline B", "line B\nline C", "line C\nline D"])
        self.assertEqual(res.split(), "line A line B line C line D".split())
        for w in "ABCD":
            self.assertEqual(res.count(f"line {w}"), 1)

    def test_repeated_line_later_is_kept(self):
        res = run(["Ja.", "Wie geht es dir?", "Mir geht es gut.", "Und dir?", "Ja."])
        self.assertEqual(res.count("Ja."), 2)

    def test_timing_tags_stripped(self):
        res = run(["Hallo<00:00:01.234><c> Welt</c>"])
        self.assertEqual(res, "Hallo Welt")

    def test_consecutive_genuine_repeat_is_dropped(self):
        # indistinguishable from scrolling; accepted limitation
        self.assertEqual(run(["Danke.", "Danke."]), "Danke.")


class ExtractCuesTest(unittest.TestCase):
    def write(self, body):
        d = tempfile.mkdtemp()
        self.addCleanup(lambda: __import__("shutil").rmtree(d))
        path = os.path.join(d, "a.vtt")
        with open(path, "w", encoding="utf-8") as f:
            f.write(body)
        return path

    def test_cues_keep_times_and_same_dedup(self):
        path = self.write(
            "WEBVTT\n\n00:00:01.500 --> 00:00:03.000\nA\nB\n\n"
            "00:00:03.000 --> 00:00:04.250\nB\nC\n\n00:01:05.000 --> 00:01:06.000\nA\n"
        )
        cues = extract_cues(path)
        self.assertEqual(cues, [
            {"start": 1.5, "end": 3.0, "text": "A B"},
            {"start": 3.0, "end": 4.25, "text": "C"},
            {"start": 65.0, "end": 66.0, "text": "A"},
        ])
        self.assertEqual(extract_subtitles(path), "A B\nC\nA")


if __name__ == "__main__":
    unittest.main()
