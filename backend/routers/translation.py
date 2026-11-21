"""Routes for translating sentences and looking up dictionary meanings through the PONS and LibreTranslate providers."""

import os
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from utils import sentence_hash
from models import SentenceTranslation
from translators.libretranslate import method2_libretranslate
from translators.pons import method1_pons

router = APIRouter()

PONS_API_KEY = os.getenv("PONS_API_KEY")
LIBRETRANSLATE_URL = os.getenv("LIBRETRANSLATE_URL", "http://localhost:5000")
DEFAULT_TRANSLATION_PRIORITY = os.getenv(
    "DEFAULT_TRANSLATION_PRIORITY", "pons,libretranslate"
)


def get_translator_providers():
    return {
        "pons": lambda word: method1_pons(word, PONS_API_KEY),
        "libretranslate": lambda word: method2_libretranslate(word, LIBRETRANSLATE_URL),
    }


def parse_priority(priority_str: Optional[str]) -> List[str]:
    raw = priority_str or DEFAULT_TRANSLATION_PRIORITY or "pons,libretranslate"
    providers = [p.strip().lower() for p in raw.split(",") if p.strip()]
    valid = ["pons", "libretranslate"]
    result = [p for p in providers if p in valid]
    for v in valid:
        if v not in result:
            result.append(v)
    return result


async def execute_translation_pipeline(
    word: str, priority_order: List[str]
) -> Tuple[Optional[Dict[str, Any]], Dict[str, str]]:
    providers = get_translator_providers()
    errors = {}
    for provider_name in priority_order:
        provider_func = providers.get(provider_name)
        if not provider_func:
            continue
        res = await provider_func(word)
        if res.get("success"):
            return res, errors
        err = res.get("error", f"{provider_name} failed")
        errors[provider_name] = err
        print(f"[{provider_name} failed] {err} — trying next in priority list")
    return None, errors


@router.get("/sentence")
async def translate_sentence(
    text: str = Query(..., max_length=1000), db: Session = Depends(get_db)
):
    sentence = " ".join(text.split())
    if not sentence:
        raise HTTPException(status_code=422, detail="Sentence is empty")
    key = sentence_hash(sentence)
    row = db.query(SentenceTranslation).filter_by(sentence_hash=key).first()
    if not row:
        res = await method2_libretranslate(sentence, LIBRETRANSLATE_URL)
        # failures are not cached: the next click retries
        if not res.get("success"):
            raise HTTPException(
                status_code=502, detail=res.get("error", "Translation failed")
            )
        row = SentenceTranslation(
            sentence_hash=key, sentence=sentence, translation=res["translations"][0]
        )
        db.add(row)
        try:
            db.commit()
        except IntegrityError:
            # a concurrent request for the same sentence saved it first
            db.rollback()
            row = db.query(SentenceTranslation).filter_by(sentence_hash=key).one()
    return {"sentence": sentence, "translation": row.translation}
