"""Streams a local-LLM explanation of a word in its sentence, reusing cached answers."""

import json
from typing import List

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from lemmatizer import NOUNS
from models import LLMAnswer
from translators import llm


def ndjson_line(obj: dict) -> str:
    """One stream line: the object as JSON followed by a newline."""
    return json.dumps(obj, ensure_ascii=False) + "\n"


def _store_answer(db: Session, lemma: str, key: str, model: str, val: dict) -> None:
    """Cache a valid answer; a concurrent request saving it first is fine."""
    db.add(LLMAnswer(lemma=lemma, sentence_hash=key, model=model, result=val))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()


async def explain_stream(
    db: Session,
    models: List[str],
    clicked: str,
    lemma: str,
    pos: str,
    article: str,
    sentence: str,
    key: str,
    meanings: list,
):
    """Yield NDJSON lines: tokens, then one result (cached or fresh) or one error; tries each model in order."""
    if not models:
        yield ndjson_line(
            {"error": "No model set: choose one in settings or set OLLAMA_MODEL"}
        )
        return
    for model in models:
        row = (
            db.query(LLMAnswer)
            .filter_by(lemma=lemma, sentence_hash=key, model=model)
            .first()
        )
        if row:
            yield ndjson_line({"result": row.result, "model": model, "cached": True})
            return
        prompt = llm.build_prompt(clicked, lemma, sentence, meanings)
        try:
            async for kind, val in llm.ask(model, prompt):
                if kind == "token":
                    yield ndjson_line({"token": val})
                    continue
                if kind == "retry":
                    yield ndjson_line({"retry": True})
                    continue
                # the app's lemmatizer beats the LLM on base form and article; failures are not cached
                val["lemma"] = lemma
                if pos in NOUNS and article:
                    val["article"] = article
                _store_answer(db, lemma, key, model, val)
                yield ndjson_line({"result": val, "model": model, "cached": False})
            return
        except llm.ModelMissing as e:
            if model == models[-1]:
                yield ndjson_line({"error": str(e)})
        except llm.LLMError as e:
            yield ndjson_line({"error": str(e)})
            return
