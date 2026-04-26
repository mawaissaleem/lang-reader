from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime

Base = declarative_base()


class Video(Base):
    __tablename__ = "videos"

    id = Column(Integer, primary_key=True, autoincrement=True)
    url = Column(String, nullable=False, unique=True)
    title = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

    subtitles = relationship("Subtitle", back_populates="video", cascade="all, delete")


class Subtitle(Base):
    __tablename__ = "subtitles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    video_id = Column(Integer, ForeignKey("videos.id"), nullable=False)
    extraction_method = Column(String, nullable=False)  # 'transcript_api' | 'yt_dlp'
    vtt_path = Column(String)
    txt_path = Column(String)
    language = Column(String, default="de")
    created_at = Column(DateTime, default=datetime.utcnow)

    video = relationship("Video", back_populates="subtitles")
