import { describe, expect, it } from "vitest";
import { countProgress, knownPct, newPer100, relativeTags } from "./progress";

const p = (known: number, learning: number, n: number) => ({
  known,
  learning,
  new: n,
  total: known + learning + n,
});

describe("progress", () => {
  it("rounds percent known", () => expect(knownPct(p(87, 0, 13))).toBe(87));
  it("is 0 for an empty text", () => expect(knownPct(p(0, 0, 0))).toBe(0));
  it("shows new words per 100", () => expect(newPer100(p(65, 0, 35))).toBe(35));
});

describe("relativeTags", () => {
  it("tags the fewest new Easiest, the most Hardest, the rest Stretch", () => {
    const tags = relativeTags({
      a: p(91, 0, 9),
      b: p(65, 0, 35),
      c: p(68, 0, 32),
      d: p(59, 0, 41),
    });
    expect(tags).toEqual({
      a: "Easiest",
      b: "Stretch",
      c: "Stretch",
      d: "Hardest",
    });
  });
  it("gives no tags for one entry, equal entries or empty texts", () => {
    expect(relativeTags({ a: p(90, 0, 10) })).toEqual({});
    expect(relativeTags({ a: p(90, 0, 10), b: p(90, 0, 10) })).toEqual({});
    expect(relativeTags({ a: p(0, 0, 0), b: p(90, 0, 10) })).toEqual({});
  });
});

describe("countProgress", () => {
  const uw = (o: Record<string, string>) =>
    Object.fromEntries(Object.entries(o).map(([k, status]) => [k, { status }]));
  it("counts unique cleaned words by status, skipping ignored", () => {
    const words = uw({ haus: "known", gehen: "learning1", der: "ignored" });
    expect(countProgress("Das Haus, das Haus! der gehen", words)).toEqual({
      known: 1,
      learning: 1,
      new: 2,
      total: 4,
    });
  });
  it("matches exact form before lowercase", () => {
    const words = uw({ Bank: "known", bank: "learning1" });
    expect(countProgress("Bank", words).known).toBe(1);
  });
  it("is empty for blank text", () =>
    expect(countProgress("  ", {}).total).toBe(0));
});
