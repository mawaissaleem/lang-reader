"""Word history behind the progress page. Every UserWord status write goes through record/set_status."""

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from models import Setting, UserWord, WordEvent

DEFAULT_DAILY_GOAL = 25
# How far along each learning status is; "ignored" has no rank, so moving there is never progress.
RANK = {"learning1": 1, "learning2": 2, "learning3": 3, "known": 4}


def record(db, user_id: int, word_id: int, status: str) -> WordEvent:
    event = WordEvent(
        user_id=user_id,
        word_id=word_id,
        status=status,
        at=datetime.now(timezone.utc),
    )
    db.add(event)
    return event


def set_status(db, uw: UserWord, status: str) -> bool:
    """Change a saved word's status and log it; no-op (and no event) when unchanged."""
    if uw.status == status:
        return False
    uw.status = status
    record(db, uw.user_id, uw.word_id, status)
    return True


def _local_day(at: datetime, tz: ZoneInfo) -> date:
    # sqlite hands back naive datetimes; they were stored as UTC
    return (at if at.tzinfo else at.replace(tzinfo=timezone.utc)).astimezone(tz).date()


def build_progress(db, user_id: int, tz: ZoneInfo, today: date) -> dict:
    """known: words now known; `before` of them have no recorded date, `days` gives [date, cumulative] on days it grew.
    streak: consecutive local days with any save or status change; today without activity yet does not break it.
    today: distinct words saved or levelled up on `today`; goal: the daily target from settings (default 25)."""
    events = (
        db.query(WordEvent)
        .filter(WordEvent.user_id == user_id)
        .order_by(WordEvent.at)
        .all()
    )
    known = {
        r[0]
        for r in db.query(UserWord.word_id).filter(
            UserWord.user_id == user_id, UserWord.status == "known"
        )
    }
    first_known: dict[int, date] = {}
    active = set()
    last: dict[int, str] = {}  # each word's status before the current event
    today_words = set()
    for e in events:
        d = _local_day(e.at, tz)
        active.add(d)
        # Count a save (no earlier event, rank 0) or a move up. "ignored" ranks 0, so saving
        # straight to ignored or moving there never counts; un-ignoring into learning does.
        prev_rank = RANK.get(last.get(e.word_id), 0)
        if d == today and RANK.get(e.status, 0) > prev_rank:
            today_words.add(e.word_id)
        last[e.word_id] = e.status
        if (
            e.status == "known" and e.word_id in known
        ):  # a word later moved off known is not counted
            first_known.setdefault(e.word_id, d)
    before = len(known) - len(first_known)
    per_day: dict[date, int] = {}
    for d in first_known.values():
        per_day[d] = per_day.get(d, 0) + 1
    days, total = [], before
    for d in sorted(per_day):
        total += per_day[d]
        days.append([d.isoformat(), total])

    current, d = 0, today if today in active else today - timedelta(days=1)
    while d in active:
        current, d = current + 1, d - timedelta(days=1)
    longest = run = 0
    prev = None
    for d in sorted(active):
        run = run + 1 if prev and d - prev == timedelta(days=1) else 1
        longest, prev = max(longest, run), d
    return {
        "known": len(known),
        "before": before,
        "days": days,
        "streak": {"current": current, "longest": longest},
        "today": len(today_words),
        "goal": daily_goal(db),
    }


def daily_goal(db) -> int:
    """The saved daily word goal, or the default when none is set."""
    row = db.get(Setting, "daily_goal")
    return row.value if row else DEFAULT_DAILY_GOAL
