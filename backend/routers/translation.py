"""Routes for translating sentences and looking up dictionary meanings through the PONS and LibreTranslate providers."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from utils import sentence_hash
from models import SentenceTranslation
from translators.libretranslate import method2_libretranslate
import config
from translation_pipeline import TRANSLATORS

router = APIRouter()


@router.get("/translators")
def list_translators():
    """The available word translators in default order, for the settings list and the side panel tabs."""
    return [{"id": t.id, "name": t.name, "note": t.note} for t in TRANSLATORS]


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
        res = await method2_libretranslate(sentence, config.libretranslate_url())
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
