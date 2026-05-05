from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
    Boolean,
    Text,
    DateTime,
    JSON,
)
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime, timezone
from sqlalchemy.ext.declarative import declarative_base

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
    vtt_path = Column(String)
    txt_path = Column(String)
    language = Column(String, default="de")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    video = relationship("Video", back_populates="subtitles")


class Dictionary(Base):
    __tablename__ = "dictionary"

    id = Column(Integer, primary_key=True, index=True)
    german_word = Column(String, unique=True, nullable=False)
    english_meanings = Column(JSON, nullable=False)
    wordclass = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    review_count = Column(Integer, default=0)
    last_reviewed_at = Column(DateTime, nullable=True)
    is_mastered = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    source = Column(
        String, nullable=False
    )  # which dictionary fetched this word e.g "pons", "mymemory"
    raw_response = Column(
        JSON, nullable=False
    )  # full raw response from whichever source was used
