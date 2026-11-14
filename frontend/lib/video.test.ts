import { describe, expect, it } from "vitest";
import { clock, currentCue, videoId } from "./video";

const cues = [{ start: 1.5, end: 3, text: "a" }, { start: 3, end: 4, text: "b" }, { start: 10, end: 12, text: "c" }];

describe("videoId", () => {
  it("reads watch, short and embed urls", () => {
    expect(videoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5")).toBe("dQw4w9WgXcQ");
    expect(videoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(videoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("is null for other urls", () => expect(videoId("https://example.com/x")).toBeNull());
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
