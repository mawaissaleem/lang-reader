import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

# CORS_ORIGINS is read at import; pin it so a developer's .env can't affect the test.
with patch.dict(os.environ, {"CORS_ORIGINS": "http://localhost:3000"}):
    import main


class CorsTest(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)

    def get(self, origin):
        return self.client.get("/docs", headers={"Origin": origin})

    def test_allowed_origin(self):
        r = self.get("http://localhost:3000")
        self.assertEqual(
            r.headers["access-control-allow-origin"], "http://localhost:3000"
        )

    def test_unlisted_origin(self):
        r = self.get("http://evil.example")
        self.assertNotIn("access-control-allow-origin", r.headers)

    def test_preflight_unlisted_origin(self):
        r = self.client.options(
            "/docs",
            headers={
                "Origin": "http://evil.example",
                "Access-Control-Request-Method": "GET",
            },
        )
        self.assertNotIn("access-control-allow-origin", r.headers)

    def test_parse_origins(self):
        self.assertEqual(
            main.parse_origins("http://a:1, http://b:2,"), ["http://a:1", "http://b:2"]
        )


if __name__ == "__main__":
    unittest.main()
