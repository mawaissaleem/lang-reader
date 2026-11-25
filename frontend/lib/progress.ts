import type { WordStatus } from "@/lib/status";
import { cleanWord, entryFor } from "@/lib/words";

export interface Progress {
  known: number;
  learning: number;
  new: number;
  total: number;
}

export const knownPct = (p: Progress) =>
  p.total ? Math.round((p.known / p.total) * 100) : 0;

/** New words per 100 unique words, the difficulty number shown on a card. */
export const newPer100 = (p: Progress) =>
  p.total ? Math.round((p.new / p.total) * 100) : 0;

export type LevelTag = "Easiest" | "Stretch" | "Hardest";

/** Tags each entry against the rest: fewest new per 100 is Easiest, most is Hardest, the others Stretch.
 *  No tags when fewer than two entries have progress or they are all equally hard. */
export function relativeTags(
  progress: Record<string, Progress>,
): Record<string, LevelTag> {
  const rated = Object.entries(progress)
    .filter(([, p]) => p.total > 0)
    .map(([key, p]) => [key, newPer100(p)] as const);
  const values = rated.map(([, n]) => n);
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (rated.length < 2 || min === max) return {};
  return Object.fromEntries(
    rated.map(([key, n]) => [
      key,
      n === min ? "Easiest" : n === max ? "Hardest" : "Stretch",
    ]),
  );
}

// Same rules as backend/progress.py: unique cleaned forms, exact-then-lowercase status match, ignored not counted.
export const countProgress = (
  text: string,
  userWords: Record<string, { status: WordStatus }>,
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
