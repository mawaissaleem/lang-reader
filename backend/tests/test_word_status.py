"""The backend status enum and the frontend status list must stay identical."""

import re
import unittest
from pathlib import Path

from models import WordStatus

STATUS_TS = Path(__file__).resolve().parents[2] / "frontend" / "lib" / "status.ts"


class WordStatusSyncTest(unittest.TestCase):
    def test_enum_matches_frontend_array(self):
        source = STATUS_TS.read_text()
        array = re.search(r"STATUSES = \[(.*?)\] as const", source, re.S).group(1)
        frontend = re.findall(r'"(\w+)"', array)
        self.assertEqual(frontend, [s.value for s in WordStatus])

    def test_members_are_plain_strings(self):
        self.assertEqual(WordStatus.KNOWN, "known")


if __name__ == "__main__":
    unittest.main()
