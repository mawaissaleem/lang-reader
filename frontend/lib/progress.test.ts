import { describe, expect, it } from "vitest";
import { countProgress, knownPct, levelTag } from "./progress";

const p = (known: number, learning: number, n: number) => ({
  known,
  learning,
  new: n,
  total: known + learning + n,
});

describe("progress", () => {
  it("rounds percent known", () => expect(knownPct(p(87, 0, 13))).toBe(87));
  it("is 0 for an empty text", () => expect(knownPct(p(0, 0, 0))).toBe(0));
  it("tags 90%+ as Good level", () =>
    expect(levelTag(p(90, 0, 10))).toBe("Good level"));
  it("tags under 75% as Hard", () =>
    expect(levelTag(p(74, 0, 26))).toBe("Hard"));
  it("gives no tag between", () => expect(levelTag(p(75, 5, 20))).toBeNull());
  it("gives no tag for an empty text", () =>
    expect(levelTag(p(0, 0, 0))).toBeNull());
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
