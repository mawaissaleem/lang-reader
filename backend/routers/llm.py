"""Routes for the local LLM (Ollama): streamed word explanations and model selection."""

import hashlib
import json
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from lemmatizer import NOUNS, analyze
from models import Dictionary, LLMAnswer, Setting
from translators import llm

router = APIRouter()


@router.get("/word/{word}/ai")
async def word_ai(
    word: str,
    sentence: str = Query(..., max_length=1000),
    db: Session = Depends(get_db),
):
    """NDJSON stream, one object per line: {"token": str} progress ({"retry": true} = attempt 1 was invalid, drop the tokens so far), then exactly one of
    {"result": {...}, "model": str, "cached": bool} or {"error": str}."""
    sentence = " ".join(sentence.split())
    if not sentence:
        raise HTTPException(status_code=422, detail="Sentence is empty")
    clicked = word.strip()
    lemma, pos, article = analyze(clicked, sentence)
    if pos not in NOUNS:
        lemma = lemma.lower()
    saved = db.get(Setting, "llm_model")
    env = os.getenv("OLLAMA_MODEL")
    models = list(
        dict.fromkeys(m for m in (saved and saved.value, env) if m)
    )  # saved model, then .env as fallback
    key = hashlib.sha256(sentence.encode()).hexdigest()
    entry = db.query(Dictionary).filter(Dictionary.german_word == lemma).first()
    meanings = [m for t in (entry.translations if entry else []) for m in t.meanings]

    def line(obj):
        return json.dumps(obj, ensure_ascii=False) + "\n"

    async def stream():
        if not models:
            yield line(
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
                yield line({"result": row.result, "model": model, "cached": True})
                return
            prompt = llm.build_prompt(clicked, lemma, sentence, meanings)
            try:
                async for kind, val in llm.ask(model, prompt):
                    if kind == "token":
                        yield line({"token": val})
                        continue
                    if kind == "retry":
                        yield line({"retry": True})
                        continue
                    # the app's lemmatizer beats the LLM on base form and article; failures are not cached
                    val["lemma"] = lemma
                    if pos in NOUNS and article:
                        val["article"] = article
                    db.add(
                        LLMAnswer(
                            lemma=lemma, sentence_hash=key, model=model, result=val
                        )
                    )
                    try:
                        db.commit()
                    except IntegrityError:  # a concurrent request saved it first
                        db.rollback()
                    yield line({"result": val, "model": model, "cached": False})
                return
            except llm.ModelMissing as e:
                if model == models[-1]:
                    yield line({"error": str(e)})
            except llm.LLMError as e:
                yield line({"error": str(e)})
                return

    return StreamingResponse(stream(), media_type="application/x-ndjson")


class ModelChoice(BaseModel):
    name: Optional[str] = None  # None clears the choice, back to OLLAMA_MODEL


@router.get("/llm/models")
async def llm_models(db: Session = Depends(get_db)):
    try:
        models = await llm.list_models()
    except llm.LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))
    saved = db.get(Setting, "llm_model")
    return {
        "models": models,
        "selected": saved.value if saved else None,
        "default": os.getenv("OLLAMA_MODEL"),
    }


@router.put("/llm/model")
async def set_llm_model(body: ModelChoice, db: Session = Depends(get_db)):
    if body.name is None:
        saved = db.get(Setting, "llm_model")
        if saved:
            db.delete(saved)
            db.commit()
        return {"selected": None}
    try:
        names = [m["name"] for m in await llm.list_models()]
    except llm.LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))
    if body.name not in names:
        raise HTTPException(
            status_code=422, detail=f"Model '{body.name}' is not installed in Ollama"
        )
    db.merge(Setting(key="llm_model", value=body.name))
    db.commit()
    return {"selected": body.name}


@router.get("/llm/running")
async def llm_running():
    try:
        return {"models": await llm.running_models()}
    except llm.LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/llm/unload")
async def llm_unload(body: ModelChoice):
    if not body.name:
        raise HTTPException(status_code=422, detail="Model name is required")
    try:
        await llm.unload(body.name)
    except llm.LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {"unloaded": body.name}
