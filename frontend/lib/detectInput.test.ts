import { describe, expect, it } from "vitest";
import { detectInput, normalizeYouTubeUrl } from "./detectInput";

describe("detectInput", () => {
  it.each([
    "https://www.youtube.com/watch?v=abc123",
    "https://youtu.be/abc123",
    "https://youtu.be/abc123?t=42",
    "https://www.youtube.com/shorts/abc123",
    "https://m.youtube.com/watch?v=abc123&t=1m30s",
    "https://www.youtube.com/watch?v=abc123&list=PL1&index=2",
    "  https://music.youtube.com/watch?v=abc123  ",
  ])("detects %s as a YouTube video", (link) => {
    expect(detectInput(link)).toBe("youtube");
  });

  it.each([
    "https://www.youtube.com/playlist?list=PL1",
    "https://www.youtube.com/@somechannel",
    "https://youtu.be/",
  ])("marks %s as unsupported, not an article", (link) => {
    expect(detectInput(link)).toBe("unsupported");
  });

  it("treats other http(s) links as articles", () => {
    expect(detectInput("https://www.dw.com/de/artikel")).toBe("article");
    expect(detectInput("http://example.com")).toBe("article");
  });

  it("treats plain text as text, even when it contains a link", () => {
    expect(detectInput("Es war einmal ein Haus.")).toBe("text");
    expect(detectInput("Schau mal https://example.com an")).toBe("text");
    expect(detectInput("ftp://example.com/a")).toBe("text");
    expect(detectInput("")).toBe("text");
  });

  it("detects a file over any typed text", () => {
    const file = new File(["x"], "buch.epub");
    expect(detectInput("", file)).toBe("file");
    expect(detectInput("https://youtu.be/abc123", file)).toBe("file");
  });
});

describe("normalizeYouTubeUrl", () => {
  it("normalizes watch, short and extra-param URLs", () => {
    const want = "https://www.youtube.com/watch?v=abc123";
    expect(normalizeYouTubeUrl("https://youtu.be/abc123")).toBe(want);
    expect(normalizeYouTubeUrl("https://www.youtube.com/shorts/abc123")).toBe(
      want,
    );
    expect(
      normalizeYouTubeUrl(" https://www.youtube.com/watch?v=abc123&t=5 "),
    ).toBe(want);
  });
  it("returns empty for blank and trimmed text for non-links", () => {
    expect(normalizeYouTubeUrl("  ")).toBe("");
    expect(normalizeYouTubeUrl(" nope ")).toBe("nope");
  });
});
