import { describe, expect, it } from "vitest";
import {
  activityGrid,
  addDays,
  dailySeries,
  dayLabel,
  goalPct,
  niceTicks,
  type ProgressHistory,
} from "./history";

const base: ProgressHistory = {
  known: 0,
  before: 0,
  days: [],
  saved: [],
  week_gain: 0,
  streak: { current: 0, longest: 0 },
  today: 0,
  goal: 25,
};

describe("addDays", () => {
  it("crosses month and year ends", () => {
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-02-27", 2)).toBe("2026-03-01");
  });
});

describe("dayLabel", () => {
  it("is day and short month", () => {
    expect(dayLabel("2026-11-20")).toBe("20 Nov");
  });
});

describe("dailySeries", () => {
  const h = {
    ...base,
    known: 7,
    before: 4,
    days: [
      ["2026-11-10", 6],
      ["2026-11-12", 7],
    ] as [string, number][],
    saved: [
      ["2026-11-10", 3],
      ["2026-11-12", 1],
    ] as [string, number][],
  };

  it("carries known forward and reports each day's gain and saved count", () => {
    const pts = dailySeries(h, "2026-11-12", 7);
    expect(pts).toHaveLength(7);
    expect(pts[0]).toEqual({
      date: "2026-11-06",
      known: 4,
      gained: 0,
      saved: 0,
    });
    expect(pts[4]).toEqual({
      date: "2026-11-10",
      known: 6,
      gained: 2,
      saved: 3,
    });
    expect(pts[5]).toMatchObject({ known: 6, gained: 0, saved: 0 });
    expect(pts[6]).toMatchObject({ known: 7, gained: 1, saved: 1 });
  });

  it("starts the gain of the first day from the count the day before", () => {
    const pts = dailySeries(h, "2026-11-16", 7);
    expect(pts[0]).toMatchObject({ date: "2026-11-10", known: 6, gained: 2 });
  });

  it("All starts on the first recorded day", () => {
    const pts = dailySeries(h, "2026-11-12", "all");
    expect(pts.map((p) => p.date)).toEqual([
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
    ]);
  });

  it("All with no history is just today", () => {
    expect(dailySeries(base, "2026-11-12", "all")).toHaveLength(1);
  });
});

describe("niceTicks", () => {
  it("rounds to 1, 2 or 5 steps covering the data", () => {
    expect(niceTicks(130, 338)).toEqual([100, 200, 300, 400]);
    expect(niceTicks(0, 10)).toEqual([0, 5, 10]);
  });
  it("gives a range for a flat series", () => {
    const t = niceTicks(5, 5);
    expect(t.length).toBeGreaterThan(1);
    expect(t[0]).toBeLessThanOrEqual(5);
    expect(t[t.length - 1]).toBeGreaterThan(5);
  });
  it("keeps a flat line off the bottom edge", () => {
    const t = niceTicks(342, 342);
    expect(t[0]).toBeLessThan(342);
    expect(t[t.length - 1]).toBeGreaterThan(342);
  });
  it.each([
    [342, 342],
    [0, 1],
    [10, 12],
  ])("gives whole-number ticks for %i..%i", (min, max) => {
    const t = niceTicks(min, max);
    expect(t.every(Number.isInteger)).toBe(true);
  });
});

describe("activityGrid", () => {
  const h = {
    ...base,
    saved: [
      ["2026-11-24", 6],
      ["2026-11-20", 2],
      ["2026-09-01", 9], // 84 days back would be 09-02: outside the grid
    ] as [string, number][],
  };
  const cells = activityGrid(h, "2026-11-24");

  it("is 84 days, oldest first, ending today", () => {
    expect(cells).toHaveLength(84);
    expect(cells[0].date).toBe("2026-09-02");
    expect(cells[83].date).toBe("2026-11-24");
  });
  it("has zero for days without events and drops older days", () => {
    expect(cells.find((c) => c.date === "2026-11-23")?.saved).toBe(0);
    expect(cells.find((c) => c.date === "2026-09-01")).toBeUndefined();
    expect(cells.reduce((s, c) => s + c.saved, 0)).toBe(8);
  });
  it("scales intensity to the busiest day", () => {
    expect(cells[83]).toMatchObject({ saved: 6, level: 3 });
    expect(cells.find((c) => c.date === "2026-11-20")?.level).toBe(1);
    expect(cells[0].level).toBe(0);
  });
  it("columns are consecutive weeks ending today", () => {
    // cell i sits in column floor(i / 7): the last column is the 7 days up to today
    expect(cells.slice(77).map((c) => c.date)[0]).toBe("2026-11-18");
  });
});

describe("goalPct", () => {
  it("is the share of the goal reached, capped at 100", () => {
    expect(goalPct({ today: 18, goal: 25 })).toBe(72);
    expect(goalPct({ today: 40, goal: 25 })).toBe(100);
  });
});
