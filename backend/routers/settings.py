"""User preferences kept in the Setting table, limited to a fixed list of keys."""

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy.orm import Session

from database import get_db
from models import Setting
from translation_pipeline import VALID_PROVIDERS

router = APIRouter()


class UserSettings(BaseModel):
    """The allowed keys; add a field here to allow a new one. Unknown keys are a 422."""

    model_config = ConfigDict(extra="forbid")

    translator_priority: Optional[list[str]] = None
    anki_default: Optional[bool] = None
    # blank means "use the built-in deck name"
    anki_deck_words: Optional[str] = None
    anki_deck_sentences: Optional[str] = None

    @field_validator("anki_deck_words", "anki_deck_sentences")
    @classmethod
    def trimmed(cls, name):
        return name.strip() if name is not None else name

    @field_validator("translator_priority")
    @classmethod
    def known_translators(cls, ids):
        unknown = [i for i in ids or [] if i not in VALID_PROVIDERS]
        if unknown:
            raise ValueError(f"unknown translators: {', '.join(unknown)}")
        return ids

    @field_validator("*")
    @classmethod
    def not_null(cls, value):
        # a null would otherwise store "no preference"; PUT sends only the keys it changes
        if value is None:
            raise ValueError("null is not allowed")
        return value


def saved_value(db: Session, key: str):
    """The stored value for one setting key, or None when nothing is saved."""
    row = db.get(Setting, key)
    return row.value if row else None


def _all_saved(db: Session) -> dict:
    return {key: saved_value(db, key) for key in UserSettings.model_fields}


@router.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    """Every allowed key; null where nothing is saved yet."""
    return _all_saved(db)


@router.put("/settings")
def put_settings(body: UserSettings, db: Session = Depends(get_db)):
    """Save the keys that were sent and leave the others as they are."""
    for key, value in body.model_dump(exclude_unset=True).items():
        db.merge(Setting(key=key, value=value))
    db.commit()
    return _all_saved(db)
