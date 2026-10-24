import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

import anki
import main


def client_for(handler):
    real = httpx.AsyncClient
    return patch("anki.httpx.AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))


class InvokeTest(unittest.IsolatedAsyncioTestCase):
    async def test_returns_result_and_sends_v6(self):
        seen = {}

        def handler(req):
            seen["body"] = req.content
            return httpx.Response(200, json={"result": ["Default"], "error": None})

        with client_for(handler):
            self.assertEqual(await anki.invoke("deckNames"), ["Default"])
        self.assertIn(b'"version":6', seen["body"].replace(b" ", b""))

    async def test_error_field_raises(self):
        with client_for(lambda r: httpx.Response(200, json={"result": None, "error": "boom"})):
            with self.assertRaises(anki.AnkiError):
                await anki.invoke("x")

    async def test_unreachable_raises(self):
        def handler(req):
            raise httpx.ConnectError("refused")

        with client_for(handler):
            with self.assertRaises(anki.AnkiError):
                await anki.invoke("version")


class StatusTest(unittest.TestCase):
    def test_open(self):
        with client_for(lambda r: httpx.Response(200, json={"result": 6, "error": None})):
            r = TestClient(main.app).get("/anki/status")
        self.assertEqual(r.json(), {"connected": True, "version": 6})

    def test_closed(self):
        def handler(req):
            raise httpx.ConnectError("refused")

        with client_for(handler):
            r = TestClient(main.app).get("/anki/status")
        self.assertEqual(r.json(), {"connected": False, "version": None})


class FakeAnki:
    """Stateful AnkiConnect stand-in; records every action."""

    def __init__(self, decks=(), models=()):
        self.decks, self.models, self.calls = list(decks), list(models), []

    def __call__(self, req):
        import json
        body = json.loads(req.content)
        a, p = body["action"], body["params"]
        self.calls.append((a, p))
        if a == "createDeck":
            self.decks.append(p["deck"])
        if a == "createModel":
            self.models.append(p["modelName"])
        result = {"deckNames": self.decks, "modelNames": self.models}.get(a)
        return httpx.Response(200, json={"result": result, "error": None})

    def actions(self):
        return [a for a, _ in self.calls]


class SetupTest(unittest.IsolatedAsyncioTestCase):
    async def test_creates_then_idempotent(self):
        fake = FakeAnki(decks=["Default"], models=["Basic"])
        with client_for(fake):
            first = await anki.ensure_setup()
            n = len(fake.calls)
            second = await anki.ensure_setup()
        self.assertEqual(len(first["decks"]), 2)
        self.assertEqual(len(first["models"]), 2)
        self.assertEqual(second, {"decks": [], "models": []})
        self.assertEqual(fake.actions()[n:], ["deckNames", "modelNames"])

    async def test_models_have_fields_and_two_templates(self):
        fake = FakeAnki()
        with client_for(fake):
            await anki.ensure_setup()
        models = {p["modelName"]: p for a, p in fake.calls if a == "createModel"}
        self.assertEqual(models["Reader Word"]["inOrderFields"][:2], ["Lemma", "Article"])
        self.assertEqual(len(models["Reader Word"]["cardTemplates"]), 2)
        self.assertEqual(models["Reader Sentence"]["inOrderFields"][0], "SentenceDE")
        self.assertEqual(len(models["Reader Sentence"]["cardTemplates"]), 2)

    async def test_existing_model_not_modified(self):
        fake = FakeAnki(decks=anki.DECKS, models=["Reader Word"])
        with client_for(fake):
            r = await anki.ensure_setup()
        self.assertEqual(r["models"], ["Reader Sentence"])
        self.assertNotIn("createDeck", fake.actions())
        self.assertEqual([p["modelName"] for a, p in fake.calls if a == "createModel"], ["Reader Sentence"])


class SetupEndpointTest(unittest.TestCase):
    def test_ok(self):
        with client_for(FakeAnki()):
            r = TestClient(main.app).post("/anki/setup")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.json()["models"]), 2)

    def test_anki_closed_is_502(self):
        def handler(req):
            raise httpx.ConnectError("refused")

        with client_for(handler):
            r = TestClient(main.app).post("/anki/setup")
        self.assertEqual(r.status_code, 502)
