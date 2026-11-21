import { describe, expect, it } from "vitest";
import { axisLabels, chartPoints } from "./history";

const streak = { current: 0, longest: 0 };

describe("chartPoints", () => {
  it("steps up on the growth day and runs flat to today", () => {
    const h = {
      known: 4,
      before: 1,
      days: [["2026-11-10", 4]] as [string, number][],
      streak,
    };
    // x spans 11-09..11-12 (3 days) over w=300: the step sits at x=100; y 0 is the max
    expect(chartPoints(h, "2026-11-12", 300, 100)).toBe(
      "0.0,75.0 100.0,75.0 100.0,0.0 300.0,0.0",
    );
  });

  it("does not divide by zero with no words", () => {
    const h = { known: 0, before: 0, days: [], streak };
    expect(chartPoints(h, "2026-11-12", 300, 100)).not.toContain("NaN");
  });
});

describe("axisLabels", () => {
  it("omits the year within one year", () => {
    expect(axisLabels("2026-05-06", "2026-11-21")).toEqual(["6 May", "21 Nov"]);
  });
  it("adds the year across years", () => {
    expect(axisLabels("2025-11-21", "2026-01-02")).toEqual([
      "21 Nov 2025",
      "2 Jan 2026",
    ]);
  });
  it("handles a single day", () => {
    expect(axisLabels("2026-11-21", "2026-11-21")).toEqual([
      "21 Nov",
      "21 Nov",
    ]);
  });
});
