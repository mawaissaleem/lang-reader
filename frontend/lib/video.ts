import { cleanWord } from "@/lib/words";

export interface Cue {
  start: number;
  end: number;
  text: string;
}

// watch?v=, youtu.be/, /embed/, /shorts/ -> the 11-char id, else null
export function videoId(url: string): string | null {
  const m = url.match(/(?:[?&]v=|youtu\.be\/|\/embed\/|\/shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}

// Index of the last cue that started at or before t (it stays current through gaps); -1 before the first.
export function currentCue(cues: Cue[], t: number): number {
  let lo = 0,
    hi = cues.length - 1,
    ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export const clock = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const USER_SCROLL_PAUSE_MS = 4000;

/** True while the user scrolled the transcript by hand recently, so auto-scroll should leave it alone. */
export function userScrolledRecently(lastAt: number, now: number): boolean {
  return lastAt > 0 && now - lastAt < USER_SCROLL_PAUSE_MS;
}

/** New scrollTop that centres a line, or null when the line is already fully visible. */
export function scrollTopFor(
  lineTop: number,
  lineHeight: number,
  viewTop: number,
  viewHeight: number,
): number | null {
  const visible =
    lineTop >= viewTop && lineTop + lineHeight <= viewTop + viewHeight;
  if (visible) return null;
  return Math.max(0, lineTop - (viewHeight - lineHeight) / 2);
}

/** How many words of a line have no saved status (the reader's "new" words). */
export function newWordCount(
  text: string,
  statusOf: (word: string) => unknown,
): number {
  return text
    .split(/\s+/)
    .map(cleanWord)
    .filter((w) => w && !statusOf(w)).length;
}

export interface Tick {
  /** position along the timeline, 0..1 */
  at: number;
  /** height, 0..1: the line's new-word count against the cap */
  level: number;
}

const TICK_CAP = 5;

/** One tick per cue that has new words; none when the duration is unknown. */
export function ticksFor(
  cues: Cue[],
  newCount: (text: string) => number,
  duration: number,
): Tick[] {
  if (!(duration > 0)) return [];
  const ticks: Tick[] = [];
  for (const cue of cues) {
    const count = newCount(cue.text);
    if (count === 0) continue;
    ticks.push({
      at: Math.min(1, cue.start / duration),
      level: Math.min(count, TICK_CAP) / TICK_CAP,
    });
  }
  return ticks;
}
