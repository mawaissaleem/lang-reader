export interface Cue { start: number; end: number; text: string }

// watch?v=, youtu.be/, /embed/, /shorts/ -> the 11-char id, else null
export function videoId(url: string): string | null {
  const m = url.match(/(?:[?&]v=|youtu\.be\/|\/embed\/|\/shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}

// Index of the last cue that started at or before t (it stays current through gaps); -1 before the first.
export function currentCue(cues: Cue[], t: number): number {
  let lo = 0, hi = cues.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
