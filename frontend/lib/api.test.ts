import { afterEach, describe, expect, it, vi } from "vitest";
import { importFromYouTube, lookupWord, saveWord } from "./api";

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
