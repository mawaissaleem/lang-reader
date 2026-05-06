import json
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import Base, Dictionary  # adjust import path if needed
import json
import os
import sys
from dotenv import load_dotenv

DATABASE_URL = "sqlite:///./subtitles.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
Base.metadata.create_all(bind=engine)  # ← add this

Session = sessionmaker(bind=engine)


def seed_dictionary(json_path: str = "dictionary.json"):
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    session = Session()
    inserted = 0
    skipped = 0

    try:
        for entry in data["dictionary"]:
            # skip if word already exists
            exists = (
                session.query(Dictionary)
                .filter_by(german_word=entry["german_word"])
                .first()
            )

            if exists:
                skipped += 1
                continue

            word = Dictionary(
                german_word=entry["german_word"],
                english_meanings=entry["english_meanings"],
                word_class=entry["word_class"],
                source=entry["source"],
                raw_response=entry,  # store full entry as raw
            )
            session.add(word)
            inserted += 1

        session.commit()
        print(
            f"Seeding done. Inserted: {inserted} | Skipped (already exist): {skipped}"
        )

    except Exception as e:
        session.rollback()
        print(f"Error during seeding: {e}")
        raise
    finally:
        session.close()


if __name__ == "__main__":
    seed_dictionary()
