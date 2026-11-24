from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
    Boolean,
    BigInteger,
    Text,
    JSON,
)
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import UniqueConstraint

Base = declarative_base()


class Video(Base):
    __tablename__ = "videos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    url = Column(String, nullable=False, unique=True)
    title = Column(String)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    subtitles = relationship("Subtitle", back_populates="video", cascade="all, delete")


class Subtitle(Base):
    __tablename__ = "subtitles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    video_id = Column(Integer, ForeignKey("videos.id"), nullable=False)
    extraction_method = Column(String, nullable=False)  # 'transcript_api' | 'yt_dlp'
    # 'manual' | 'auto-generated'; NULL = unknown (old rows)
    subtitle_type = Column(String)
    vtt_path = Column(String)
    txt_path = Column(String)
    language = Column(String, default="de")
    word_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    video = relationship("Video", back_populates="subtitles")


class ManualText(Base):
    """Texts pasted by the user (not from YouTube)."""

    __tablename__ = "texts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    word_count = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class SentenceTranslation(Base):
    """Cache of LibreTranslate sentence translations, keyed by sha256 of the normalized sentence"""

    __tablename__ = "sentence_translations"

    id = Column(Integer, primary_key=True)
    sentence_hash = Column(String, unique=True, nullable=False)
    sentence = Column(Text, nullable=False)
    translation = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class LLMAnswer(Base):
    """Cache of LLM answers per (lemma, sentence, model); a model switch never serves another model's answer"""

    __tablename__ = "llm_answers"
    __table_args__ = (UniqueConstraint("lemma", "sentence_hash", "model"),)

    id = Column(Integer, primary_key=True)
    lemma = Column(String, nullable=False)
    sentence_hash = Column(String, nullable=False)
    model = Column(String, nullable=False)
    result = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class SentenceCard(Base):
    """Outbox for Reader Sentence notes: one row per (user, sentence, target word)"""

    __tablename__ = "sentence_cards"
    __table_args__ = (UniqueConstraint("user_id", "sentence_de", "target_word"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False, index=True)
    sentence_de = Column(Text, nullable=False)
    sentence_en = Column(Text, nullable=False)
    target_word = Column(String, nullable=False)  # the lemma
    bold = Column(
        JSON, nullable=False, default=list
    )  # surface forms to bold; empty = the lemma
    source = Column(String, nullable=False)  # "AI example" or the text title
    anki_status = Column(
        String, nullable=False, default="pending"
    )  # pending | sent | failed
    anki_note_id = Column(BigInteger, nullable=True)


class Dictionary(Base):
    """GLOBAL CACHE - one row per word, shared across ALL users"""

    __tablename__ = "dictionary"

    id = Column(Integer, primary_key=True, index=True)
    german_word = Column(String, unique=True, nullable=False, index=True)
    # shortcut: these 4 columns mirror the latest fetched translation; drop once all readers use `translations`
    english_meanings = Column(JSON, nullable=False)  # ["bank (financial)", "bench"]
    word_class = Column(String, nullable=True)  # noun, verb, adjective
    source = Column(String, nullable=False)  # 'seed', 'pons', 'mymemory'
    raw_response = Column(JSON, nullable=True)  # full raw response from source
    lookup_count = Column(Integer, default=0)  # how many times any user looked it up
    last_lookup_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    translations = relationship(
        "Translation", back_populates="word", cascade="all, delete-orphan"
    )


class Translation(Base):
    """One result per (word, source) so switching translator keeps the other's result"""

    __tablename__ = "translations"
    __table_args__ = (UniqueConstraint("word_id", "source"),)

    id = Column(Integer, primary_key=True)
    word_id = Column(Integer, ForeignKey("dictionary.id"), nullable=False)
    source = Column(String, nullable=False)  # 'pons' | 'libretranslate' | 'seed' ...
    meanings = Column(JSON, nullable=False)
    word_class = Column(String, nullable=True)
    raw_response = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    word = relationship("Dictionary", back_populates="translations")


class UserWord(Base):
    """USER DICTIONARY - tracks individual user's learning progress"""

    __tablename__ = "user_words"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        Integer, nullable=False, index=True
    )  # assuming you have users table
    word_id = Column(Integer, ForeignKey("dictionary.id"), nullable=False)

    # User-specific fields
    is_mastered = Column(Boolean, default=False)
    review_count = Column(Integer, default=0)
    last_reviewed_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)  # user's personal notes
    status = Column(
        String, nullable=False, default="learning1"
    )  # learning1|learning2|learning3|known|ignored
    source = Column(
        String, nullable=True
    )  # translation source whose meaning was saved; NULL for old rows
    context_sentence = Column(Text, nullable=True)  # sentence the word was saved from
    text_kind = Column(
        String, nullable=True
    )  # video (subtitle id) | text; same names as /library "type"
    text_id = Column(Integer, nullable=True)
    anki_status = Column(
        String, nullable=False, default="none"
    )  # none | pending | sent | failed
    anki_note_id = Column(BigInteger, nullable=True)

    # When did user add this word to their known list
    added_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationship
    word = relationship("Dictionary")

    # Ensure one entry per user per word
    __table_args__ = (UniqueConstraint("user_id", "word_id", name="unique_user_word"),)


class WordEvent(Base):
    """History: one row each time a word is saved or its status changes (written only by history.py)"""

    __tablename__ = "word_events"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False, index=True)
    word_id = Column(Integer, nullable=False)
    status = Column(String, nullable=False)
    at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))


class Setting(Base):
    """Small key/value store for app settings (e.g. the Anki field mapping)"""

    __tablename__ = "settings"

    key = Column(String, primary_key=True)
    value = Column(JSON, nullable=False)
