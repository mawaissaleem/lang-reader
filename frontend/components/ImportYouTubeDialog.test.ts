import { describe, expect, it } from "vitest";
import { normalizeYouTubeUrl } from "./ImportYouTubeDialog";

describe("normalizeYouTubeUrl", () => {
  it("normalizes watch, short and extra-param URLs", () => {
    const want = "https://www.youtube.com/watch?v=abc123";
    expect(normalizeYouTubeUrl("https://youtu.be/abc123")).toBe(want);
    expect(normalizeYouTubeUrl(" https://www.youtube.com/watch?v=abc123&t=5 ")).toBe(want);
  });
  it("returns empty for blank and raw text for non-URLs", () => {
    expect(normalizeYouTubeUrl("  ")).toBe("");
    expect(normalizeYouTubeUrl("nope")).toBe("nope");
  });
});
