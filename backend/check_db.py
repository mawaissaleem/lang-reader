from database import SessionLocal
from models import Video, Subtitle

db = SessionLocal()
print("Videos:", db.query(Video).count())
print("Subtitles:", db.query(Subtitle).count())

for v in db.query(Video).all():
    print(f"  Video {v.id}: {v.title} | {v.url}")

for s in db.query(Subtitle).all():
    print(
        f"  Subtitle {s.id}: video_id={s.video_id} | txt_path={s.txt_path} | method={s.extraction_method}"
    )

db.close()
