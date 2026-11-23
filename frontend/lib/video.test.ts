import { describe, expect, it } from "vitest";
import {
  clock,
  newWordCount,
  ticksFor,
  currentCue,
  scrollTopFor,
  userScrolledRecently,
  videoId,
} from "./video";

const cues = [
  { start: 1.5, end: 3, text: "a" },
  { start: 3, end: 4, text: "b" },
  { start: 10, end: 12, text: "c" },
];

describe("videoId", () => {
  it("reads watch, short and embed urls", () => {
    expect(videoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5")).toBe(
      "dQw4w9WgXcQ",
    );
    expect(videoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(videoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });
  it("is null for other urls", () =>
    expect(videoId("https://example.com/x")).toBeNull());
});

describe("currentCue", () => {
  it("is -1 before the first cue and for no cues", () => {
    expect(currentCue(cues, 0.5)).toBe(-1);
    expect(currentCue([], 5)).toBe(-1);
  });
  it("picks the cue starting at or before t", () => {
    expect(currentCue(cues, 1.5)).toBe(0);
    expect(currentCue(cues, 3)).toBe(1);
    expect(currentCue(cues, 3.9)).toBe(1);
  });
  it("stays on the last cue through a gap and after the end", () => {
    expect(currentCue(cues, 7)).toBe(1);
    expect(currentCue(cues, 999)).toBe(2);
  });
});

describe("clock", () => {
  it("formats m:ss", () => expect(clock(65.9)).toBe("1:05"));
});

describe("userScrolledRecently", () => {
  it("is true within the pause window and false after or when never scrolled", () => {
    expect(userScrolledRecently(1000, 2000)).toBe(true);
    expect(userScrolledRecently(1000, 6000)).toBe(false);
    expect(userScrolledRecently(0, 100)).toBe(false);
  });
});

describe("scrollTopFor", () => {
  it("returns null when the line is fully visible", () => {
    expect(scrollTopFor(120, 40, 100, 300)).toBeNull();
  });
  it("centres a line that is below the view", () => {
    expect(scrollTopFor(600, 40, 0, 300)).toBe(470);
  });
  it("never goes negative for a line near the top", () => {
    expect(scrollTopFor(10, 40, 200, 300)).toBe(0);
  });
});

describe("newWordCount", () => {
  const known = (w: string) => (w === "Haus" ? "known" : undefined);
  it("counts words without a status and skips punctuation", () => {
    expect(newWordCount("Das Haus, 42 ... ist", known)).toBe(2);
  });
});

describe("ticksFor", () => {
  const two = [
    { start: 10, end: 12, text: "a" },
    { start: 50, end: 52, text: "b" },
    { start: 80, end: 82, text: "c" },
  ];
  const counts: Record<string, number> = { a: 2, b: 0, c: 9 };
  const count = (t: string) => counts[t];
  it("skips lines without new words and places the rest by start time", () => {
    expect(ticksFor(two, count, 100).map((t) => t.at)).toEqual([0.1, 0.8]);
  });
  it("scales height by count and caps it", () => {
    expect(ticksFor(two, count, 100).map((t) => t.level)).toEqual([0.4, 1]);
  });
  it("is empty while the duration is unknown", () => {
    expect(ticksFor(two, count, 0)).toEqual([]);
  });
});
