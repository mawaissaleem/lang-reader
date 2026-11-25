import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import config


class PiperBinTest(unittest.TestCase):
    def test_env_override_wins(self):
        with patch.dict(os.environ, {"PIPER_BIN": "/opt/piper"}):
            self.assertEqual(config.piper_bin(), Path("/opt/piper"))

    def test_default_is_piper_on_path(self):
        with (
            patch.dict(os.environ, clear=False),
            patch.object(config.shutil, "which", return_value="/usr/bin/piper"),
        ):
            os.environ.pop("PIPER_BIN", None)
            self.assertEqual(config.piper_bin(), Path("/usr/bin/piper"))

    def test_falls_back_to_venv_piper(self):
        with (
            patch.dict(os.environ, clear=False),
            patch.object(config.shutil, "which", return_value=None),
        ):
            os.environ.pop("PIPER_BIN", None)
            self.assertEqual(config.piper_bin(), Path(sys.executable).parent / "piper")


if __name__ == "__main__":
    unittest.main()
