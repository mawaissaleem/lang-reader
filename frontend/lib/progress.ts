import { cleanWord, entryFor } from "@/lib/words";

export interface Progress {
  known: number;
  learning: number;
  new: number;
  total: number;
}

export const knownPct = (p: Progress) =>
  p.total ? Math.round((p.known / p.total) * 100) : 0;

// "Good level" from 90% known, "Hard" under 75%, nothing between
export const levelTag = (p: Progress): "Good level" | "Hard" | null =>
  !p.total
    ? null
    : p.known / p.total >= 0.9
      ? "Good level"
      : p.known / p.total < 0.75
        ? "Hard"
        : null;

// Same rules as backend/progress.py: unique cleaned forms, exact-then-lowercase status match, ignored not counted.
export const countProgress = (
  text: string,
  userWords: Record<string, { status: string }>,
): Progress => {
  const p = { known: 0, learning: 0, new: 0, total: 0 };
  const words = new Set(text.split(/\s+/).map(cleanWord).filter(Boolean));
  for (const w of words) {
    const s = entryFor(userWords, w)?.status;
    if (s === "ignored") continue;
    p[s === undefined ? "new" : s === "known" ? "known" : "learning"]++;
    p.total++;
  }
  return p;
};
