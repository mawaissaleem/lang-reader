import json
import os
import sys
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from translators.llm import SCHEMA, build_prompt, is_valid
from models import Base, Setting
from database import get_db
import main

GOOD = {
    "lemma": "anfangen",
    "pos": "verb",
    "article": None,
    "plural": None,
    "meaning_in_context": "to begin",
    "sentence_translation": "The film starts at eight.",
    "examples": [{"de": "Wir fangen an.", "en": "We begin."}],
    "note": None,
}


class ValidTest(unittest.TestCase):
    def test_good(self):
        self.assertTrue(is_valid(GOOD))

    def test_schema_required_matches_validator(self):
        self.assertEqual(set(SCHEMA["required"]), set(GOOD))

    def test_missing_key(self):
        self.assertFalse(is_valid({k: v for k, v in GOOD.items() if k != "note"}))

    def test_wrong_type(self):
        self.assertFalse(is_valid({**GOOD, "lemma": 5}))

    def test_bad_example(self):
        self.assertFalse(is_valid({**GOOD, "examples": [{"de": "x"}]}))

    def test_null_strings_become_none(self):
        obj = {**GOOD, "article": "null", "plural": "", "note": " Null "}
        self.assertTrue(is_valid(obj))
        self.assertEqual(
            (obj["article"], obj["plural"], obj["note"]), (None, None, None)
        )

    def test_empty_examples_rejected(self):
        self.assertFalse(is_valid({**GOOD, "examples": []}))

    def test_schema_is_strict(self):
        self.assertIs(SCHEMA["additionalProperties"], False)
        self.assertEqual(SCHEMA["properties"]["examples"]["minItems"], 1)

    def test_not_dict(self):
        self.assertFalse(is_valid([GOOD]))


class PromptTest(unittest.TestCase):
    def test_contains_inputs(self):
        p = build_prompt(
            "fängt", "anfangen", "Der Film fängt an.", ["to begin", "to start"]
        )
        for s in (
            "fängt",
            "anfangen",
            "Der Film fängt an.",
            "- to begin",
            "- to start",
        ):
            self.assertIn(s, p)


def ndjson(*texts):
    """An Ollama streaming body whose chunks concatenate to the given text."""
    return "\n".join(json.dumps({"response": t}) for t in texts).encode()


class AiEndpointTest(unittest.TestCase):
    def setUp(self):
        engine = create_engine(
            "sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False}
        )
        Base.metadata.create_all(bind=engine)
        self.Session = sessionmaker(bind=engine)

        def db():
            s = self.Session()
            try:
                yield s
            finally:
                s.close()

        main.app.dependency_overrides[get_db] = db
        self.addCleanup(main.app.dependency_overrides.clear)
        self.client = TestClient(main.app)
        self.calls = []  # (model) per Ollama request
        self.bodies = []  # queued response bodies, popped per request
        self.real = real = httpx.AsyncClient

        def handler(req):
            body = json.loads(req.content)
            self.calls.append(body["model"])
            if body["model"] == "gone":
                return httpx.Response(404, json={"error": "model not found"})
            return httpx.Response(200, content=self.bodies.pop(0))

        for p in (
            patch(
                "translators.llm.httpx.AsyncClient",
                lambda **kw: real(transport=httpx.MockTransport(handler), **kw),
            ),
            patch.dict(os.environ, {"OLLAMA_MODEL": "env-model"}),
            patch("main.analyze", lambda w, s=None: ("anfangen", "VERB", None)),
        ):
            p.start()
            self.addCleanup(p.stop)

    def ask(self, sentence="Der Film fängt an."):
        r = self.client.get("/word/fängt/ai", params={"sentence": sentence})
        return [json.loads(x) for x in r.text.splitlines()]

    def test_valid_answer_streams_then_is_cached(self):
        self.bodies.append(ndjson(json.dumps(GOOD)[:20], json.dumps(GOOD)[20:]))
        first = self.ask()
        self.assertIn("token", first[0])
        self.assertEqual(
            first[-1], {"result": GOOD, "model": "env-model", "cached": False}
        )
        second = self.ask()
        self.assertEqual(
            second, [{"result": GOOD, "model": "env-model", "cached": True}]
        )
        self.assertEqual(len(self.calls), 1)

    def test_invalid_then_valid_retries(self):
        self.bodies += [ndjson("not json"), ndjson(json.dumps(GOOD))]
        lines = self.ask()
        self.assertIn("result", lines[-1])
        self.assertEqual(
            lines[1], {"retry": True}
        )  # marker between attempt 1's tokens and attempt 2's
        self.assertEqual(sum("retry" in x for x in lines), 1)
        self.assertEqual(len(self.calls), 2)

    def test_invalid_twice_is_error_and_not_cached(self):
        self.bodies += [ndjson("{"), ndjson("{"), ndjson(json.dumps(GOOD))]
        self.assertIn("error", self.ask()[-1])
        self.assertEqual(len(self.calls), 2)
        self.assertIn("result", self.ask()[-1])  # failure was not cached

    def test_app_lemma_overrides_llm(self):
        self.bodies.append(ndjson(json.dumps({**GOOD, "lemma": "wrong"})))
        self.assertEqual(self.ask()[-1]["result"]["lemma"], "anfangen")

    def test_saved_model_wins_and_keys_the_cache(self):
        with self.Session() as s:
            s.add(Setting(key="llm_model", value="saved-model"))
            s.commit()
        self.bodies.append(ndjson(json.dumps(GOOD)))
        self.assertEqual(self.ask()[-1]["model"], "saved-model")
        with self.Session() as s:
            s.get(Setting, "llm_model").value = "other"
            s.commit()
        self.bodies.append(ndjson(json.dumps(GOOD)))
        self.assertFalse(self.ask()[-1]["cached"])  # another model: no cache hit
        self.assertEqual(self.calls, ["saved-model", "other"])

    def test_missing_saved_model_falls_back_to_env(self):
        with self.Session() as s:
            s.add(Setting(key="llm_model", value="gone"))
            s.commit()
        self.bodies.append(ndjson(json.dumps(GOOD)))
        self.assertEqual(self.ask()[-1]["model"], "env-model")

    def test_missing_model_only_is_error(self):
        with patch.dict(os.environ, {"OLLAMA_MODEL": "gone"}):
            self.assertIn("not installed", self.ask()[-1]["error"])

    def test_ollama_down_is_error(self):
        def down(req):
            raise httpx.ConnectError("refused")

        real = self.real
        with patch(
            "translators.llm.httpx.AsyncClient",
            lambda **kw: real(transport=httpx.MockTransport(down), **kw),
        ):
            self.assertIn("not reachable", self.ask()[-1]["error"])

    def test_error_line_mid_stream_is_ollama_message_without_retry(self):
        self.bodies.append(
            b'{"response": "{"}\n{"error": "model runner has unexpectedly stopped"}'
        )
        self.assertIn("runner has unexpectedly stopped", self.ask()[-1]["error"])
        self.assertEqual(len(self.calls), 1)

    def test_empty_sentence_is_422(self):
        r = self.client.get("/word/fängt/ai", params={"sentence": "  "})
        self.assertEqual(r.status_code, 422)


class ModelsEndpointTest(unittest.TestCase):
    def setUp(self):
        engine = create_engine(
            "sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False}
        )
        Base.metadata.create_all(bind=engine)
        self.Session = sessionmaker(bind=engine)

        def db():
            s = self.Session()
            try:
                yield s
            finally:
                s.close()

        main.app.dependency_overrides[get_db] = db
        self.addCleanup(main.app.dependency_overrides.clear)
        self.client = TestClient(main.app)
        self.tags = [{"name": "qwen2.5:3b", "size": 1_900_000_000}]
        self.down = False
        self.generate_status = 200
        self.running = []
        self.posted = []
        self.real = real = httpx.AsyncClient

        def handler(req):
            if self.down:
                raise httpx.ConnectError("refused")
            if req.url.path == "/api/ps":
                return httpx.Response(200, json={"models": self.running})
            if req.url.path == "/api/generate":
                self.posted.append(json.loads(req.content))
                return httpx.Response(self.generate_status, json={"done": True})
            return httpx.Response(200, json={"models": self.tags})

        for p in (
            patch(
                "translators.llm.httpx.AsyncClient",
                lambda **kw: real(transport=httpx.MockTransport(handler), **kw),
            ),
            patch.dict(os.environ, {"OLLAMA_MODEL": "qwen2.5:3b"}),
        ):
            p.start()
            self.addCleanup(p.stop)

    def test_lists_live_with_no_filter(self):
        self.assertEqual(
            self.client.get("/llm/models").json(),
            {"models": self.tags, "selected": None, "default": "qwen2.5:3b"},
        )
        self.tags.append(
            {"name": "huge:70b", "size": 40_000_000_000}
        )  # pulled later, no restart
        self.assertEqual(
            [m["name"] for m in self.client.get("/llm/models").json()["models"]],
            ["qwen2.5:3b", "huge:70b"],
        )

    def test_running_loaded_and_not_loaded(self):
        self.assertEqual(self.client.get("/llm/running").json(), {"models": []})
        self.running = [
            {"name": "qwen2.5:3b", "expires_at": "2026-11-21T10:05:00Z", "size": 1}
        ]
        self.assertEqual(
            self.client.get("/llm/running").json(),
            {"models": [{"name": "qwen2.5:3b", "expires_at": "2026-11-21T10:05:00Z"}]},
        )

    def test_running_ollama_down_is_502(self):
        self.down = True
        self.assertEqual(self.client.get("/llm/running").status_code, 502)

    def test_unload_sends_keep_alive_zero(self):
        r = self.client.post("/llm/unload", json={"name": "qwen2.5:3b"})
        self.assertEqual(r.json(), {"unloaded": "qwen2.5:3b"})
        self.assertEqual(self.posted, [{"model": "qwen2.5:3b", "keep_alive": 0}])

    def test_unload_without_name_is_422(self):
        self.assertEqual(self.client.post("/llm/unload", json={}).status_code, 422)

    def test_unload_ollama_down_is_502(self):
        self.down = True
        r = self.client.post("/llm/unload", json={"name": "qwen2.5:3b"})
        self.assertEqual(r.status_code, 502)

    def test_unload_missing_model_says_so_not_unreachable(self):
        self.generate_status = 404
        r = self.client.post("/llm/unload", json={"name": "gone:1b"})
        self.assertEqual(r.status_code, 502)
        self.assertIn("not installed", r.json()["detail"])
        self.assertNotIn("not reachable", r.json()["detail"])

    def test_unload_other_ollama_error_names_the_status(self):
        self.generate_status = 500
        r = self.client.post("/llm/unload", json={"name": "qwen2.5:3b"})
        self.assertEqual(r.status_code, 502)
        self.assertIn("returned 500", r.json()["detail"])

    def test_ollama_down_is_502(self):
        self.down = True
        r = self.client.get("/llm/models")
        self.assertEqual(r.status_code, 502)
        self.assertIn("not reachable", r.json()["detail"])

    def test_save_valid_then_listed_as_selected(self):
        self.tags.append({"name": "huge:70b", "size": 40_000_000_000})
        self.assertEqual(
            self.client.put("/llm/model", json={"name": "huge:70b"}).json(),
            {"selected": "huge:70b"},
        )
        self.assertEqual(self.client.get("/llm/models").json()["selected"], "huge:70b")

    def test_save_unknown_name_is_422_and_not_saved(self):
        self.assertEqual(
            self.client.put("/llm/model", json={"name": "nope"}).status_code, 422
        )
        self.assertIsNone(self.client.get("/llm/models").json()["selected"])

    def test_save_when_ollama_down_is_502(self):
        self.down = True
        self.assertEqual(
            self.client.put("/llm/model", json={"name": "qwen2.5:3b"}).status_code, 502
        )

    def test_clear(self):
        self.client.put("/llm/model", json={"name": "qwen2.5:3b"})
        self.assertEqual(
            self.client.put("/llm/model", json={"name": None}).json(),
            {"selected": None},
        )
        self.assertIsNone(self.client.get("/llm/models").json()["selected"])

    def test_ai_endpoint_uses_the_saved_model(self):
        self.tags.append({"name": "big:32b", "size": 20_000_000_000})
        self.client.put("/llm/model", json={"name": "big:32b"})
        used = []
        real = self.real

        def gen(req):
            used.append(json.loads(req.content)["model"])
            return httpx.Response(200, content=ndjson(json.dumps(GOOD)))

        with (
            patch(
                "translators.llm.httpx.AsyncClient",
                lambda **kw: real(transport=httpx.MockTransport(gen), **kw),
            ),
            patch("main.analyze", lambda w, s=None: ("anfangen", "VERB", None)),
        ):
            r = self.client.get(
                "/word/fängt/ai", params={"sentence": "Der Film fängt an."}
            )
        self.assertEqual(json.loads(r.text.splitlines()[-1])["model"], "big:32b")
        self.assertEqual(used, ["big:32b"])


if __name__ == "__main__":
    unittest.main()
