import { describe, expect, it } from "vitest";
import type { LibraryEntry } from "./api";
import { sortEntries, upNext } from "./sortEntries";

const e = (id: number, title: string, created_at: string) =>
  ({ id, type: "text", title, created_at }) as unknown as LibraryEntry;
const a = e(1, "Bahnhof", "2026-01-01");
const b = e(2, "Apfel", "2026-03-01");
const c = e(3, "Café", "2026-02-01");
const progress = {
  "text-1": { known: 9, learning: 0, new: 1, total: 10 },
  "text-2": { known: 5, learning: 0, new: 5, total: 10 },
};
const ids = (list: LibraryEntry[]) => list.map((x) => x.id);

describe("sortEntries", () => {
  it("easiest puts fewest new first and entries without progress last", () =>
    expect(ids(sortEntries([b, c, a], "easiest", progress))).toEqual([
      1, 2, 3,
    ]));
  it("newest puts the latest first", () =>
    expect(ids(sortEntries([a, b, c], "newest", progress))).toEqual([2, 3, 1]));
  it("title sorts alphabetically", () =>
    expect(ids(sortEntries([a, b, c], "title", progress))).toEqual([2, 1, 3]));
});

describe("upNext", () => {
  it("picks the easiest entry with new words left", () => {
    const done = {
      ...progress,
      "text-1": { known: 10, learning: 0, new: 0, total: 10 },
    };
    expect(upNext([a, b, c], progress)?.id).toBe(1);
    expect(upNext([a, b, c], done)?.id).toBe(2);
  });
  it("is undefined when nothing has new words", () =>
    expect(upNext([a, c], {})).toBeUndefined());
});
