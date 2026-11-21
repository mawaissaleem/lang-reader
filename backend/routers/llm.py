"""Routes for the local LLM (Ollama): streamed word explanations and model selection."""

import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from utils import sentence_hash
from database import get_db
from lemmatizer import word_key
from models import Dictionary, Setting
from translators import llm
from word_explainer import explain_stream

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
    lemma, pos, article = word_key(clicked, sentence)
    saved = db.get(Setting, "llm_model")
    models = llm.models_to_try(saved and saved.value, os.getenv("OLLAMA_MODEL"))
    key = sentence_hash(sentence)
    entry = db.query(Dictionary).filter(Dictionary.german_word == lemma).first()
    meanings = [m for t in (entry.translations if entry else []) for m in t.meanings]

    stream = explain_stream(
        db, models, clicked, lemma, pos, article, sentence, key, meanings
    )
    return StreamingResponse(stream, media_type="application/x-ndjson")


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
