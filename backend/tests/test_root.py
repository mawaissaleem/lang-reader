import unittest

from fastapi.testclient import TestClient

import main


class RootTest(unittest.TestCase):
    def test_root_reports_status(self):
        r = TestClient(main.app).get("/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {"message": "lang-reader API is running"})
