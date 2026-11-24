import { entryKey, type LibraryEntry } from "@/lib/api";
import { newPer100, type Progress } from "@/lib/progress";

export type SortKey = "easiest" | "newest" | "title";

/** Returns a sorted copy: easiest = fewest new words per 100 first (entries without progress last), newest first, or by title. */
export function sortEntries(
  entries: LibraryEntry[],
  sort: SortKey,
  progress: Record<string, Progress>,
): LibraryEntry[] {
  const difficulty = (e: LibraryEntry) => {
    const p = progress[entryKey(e)];
    return p && p.total > 0 ? newPer100(p) : Number.MAX_SAFE_INTEGER;
  };
  const by: Record<SortKey, (a: LibraryEntry, b: LibraryEntry) => number> = {
    easiest: (a, b) => difficulty(a) - difficulty(b),
    newest: (a, b) => b.created_at.localeCompare(a.created_at),
    title: (a, b) => a.title.localeCompare(b.title),
  };
  return [...entries].sort(by[sort]);
}
