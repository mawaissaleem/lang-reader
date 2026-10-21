import { afterEach, describe, expect, it, vi } from "vitest";
import { createText, entryKey, fetchEntryText, fetchText, importFromYouTube, lookupWord, renameEntry, renameText, saveWord, type LibraryEntry } from "./api";

function stubFetch(status: number, body: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(body, { status })),
  );
}

afterEach(() => vi.unstubAllGlobals());

const calls: [string, () => Promise<unknown>][] = [
  ["importFromYouTube", () => importFromYouTube("https://youtu.be/x")],
  ["lookupWord", () => lookupWord("Haus", 1)],
  ["saveWord", () => saveWord(1, 1)],
  ["createText", () => createText("t", "x")],
  ["fetchText", () => fetchText(1)],
  ["renameText", () => renameText(1, "t")],
];

describe.each(calls)("%s errors", (_name, call) => {
  it("surfaces the backend detail on a JSON error", async () => {
    stubFetch(409, JSON.stringify({ detail: "This video already exists..." }));
    await expect(call()).rejects.toThrow("This video already exists...");
  });

  it("falls back to the status for a non-JSON error body", async () => {
    stubFetch(500, "<html>boom</html>");
    await expect(call()).rejects.toThrow("Request failed with status 500");
  });
});

const entry = (type: "video" | "text"): LibraryEntry => ({
  id: 5, video_id: type === "video" ? 9 : null, type, title: "t", language: "de",
  source: type === "video" ? "youtube" : "manual", created_at: "", word_count: 1, extraction_method: null,
});

describe("entry dispatch", () => {
  it("keys differ between a subtitle and a text with the same id", () => {
    expect(entryKey(entry("video"))).not.toBe(entryKey(entry("text")));
  });

  it("fetches text by entry type", async () => {
    const f = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ text: "hi" })));
    vi.stubGlobal("fetch", f);
    await fetchEntryText(entry("text"));
    await fetchEntryText(entry("video"));
    expect(f.mock.calls.map(c => c[0])).toEqual([expect.stringMatching(/\/texts\/5$/), expect.stringMatching(/\/subtitles\/5\/text$/)]);
  });

  it("renames by entry type", async () => {
    const f = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ id: 1, title: "n" })));
    vi.stubGlobal("fetch", f);
    await renameEntry(entry("text"), "n");
    await renameEntry(entry("video"), "n");
    expect(f.mock.calls.map(c => c[0])).toEqual([expect.stringMatching(/\/texts\/5\/title$/), expect.stringMatching(/\/videos\/9\/title$/)]);
  });
});
