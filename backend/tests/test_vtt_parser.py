import os
import tempfile
import unittest

from vtt_parser import extract_subtitles


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


if __name__ == "__main__":
    unittest.main()
