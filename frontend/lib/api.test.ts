import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addSentenceCard,
  createText,
  fetchAiAnswer,
  fetchAnkiConnected,
  entryKey,
  fetchEntryText,
  fetchText,
  fetchLibrary,
  fetchLibraryProgress,
  fetchProgressHistory,
  fetchSubtitleText,
  fetchUserWords,
  importFromYouTube,
  lookupWord,
  renameEntry,
  renameText,
  saveWord,
  unloadsIn,
  type LibraryEntry,
} from "./api";

function stubFetch(status: number, body: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(body, { status })),
  );
}

afterEach(() => vi.unstubAllGlobals());

const calls: [string, () => Promise<unknown>][] = [
  ["importFromYouTube", () => importFromYouTube("https://youtu.be/x")],
  ["lookupWord", () => lookupWord("Haus")],
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
  id: 5,
  video_id: type === "video" ? 9 : null,
  type,
  title: "t",
  language: "de",
  source: type === "video" ? "youtube" : "manual",
  created_at: "",
  word_count: 1,
  extraction_method: null,
});

describe("entry dispatch", () => {
  it("keys differ between a subtitle and a text with the same id", () => {
    expect(entryKey(entry("video"))).not.toBe(entryKey(entry("text")));
  });

  it("fetches text by entry type", async () => {
    const f = vi
      .fn()
      .mockImplementation(
        async () => new Response(JSON.stringify({ text: "hi" })),
      );
    vi.stubGlobal("fetch", f);
    await fetchEntryText(entry("text"));
    await fetchEntryText(entry("video"));
    expect(f.mock.calls.map((c) => c[0])).toEqual([
      expect.stringMatching(/\/texts\/5$/),
      expect.stringMatching(/\/subtitles\/5\/text$/),
    ]);
  });

  it("renames by entry type", async () => {
    const f = vi
      .fn()
      .mockImplementation(
        async () => new Response(JSON.stringify({ id: 1, title: "n" })),
      );
    vi.stubGlobal("fetch", f);
    await renameEntry(entry("text"), "n");
    await renameEntry(entry("video"), "n");
    expect(f.mock.calls.map((c) => c[0])).toEqual([
      expect.stringMatching(/\/texts\/5\/title$/),
      expect.stringMatching(/\/videos\/9\/title$/),
    ]);
  });
});

describe("lookupWord url", () => {
  it("does not send a user id", async () => {
    stubFetch(200, "{}");
    await lookupWord("Haus");
    expect(vi.mocked(fetch).mock.calls[0][0]).not.toContain("user_id");
  });
});

describe("fetch helpers that used a fixed error message", () => {
  const helpers: [string, () => Promise<unknown>, string][] = [
    ["fetchUserWords", () => fetchUserWords(1), "Failed to fetch user words"],
    ["fetchLibrary", () => fetchLibrary(), "Failed to fetch library: 500"],
    [
      "fetchLibraryProgress",
      () => fetchLibraryProgress(),
      "Failed to fetch progress: 500",
    ],
    ["fetchSubtitleText", () => fetchSubtitleText(1), "Failed to fetch text"],
    [
      "fetchProgressHistory",
      () => fetchProgressHistory(1),
      "Failed to fetch progress: 500",
    ],
  ];

  describe.each(helpers)("%s", (_name, call, fallback) => {
    it("shows the server's detail", async () => {
      stubFetch(500, JSON.stringify({ detail: "Database is locked" }));
      await expect(call()).rejects.toThrow("Database is locked");
    });

    it("keeps its own message when the server sends no detail", async () => {
      stubFetch(500, "<html>boom</html>");
      await expect(call()).rejects.toThrow(fallback);
    });
  });
});

describe("lookupWord sentence", () => {
  it("sends the sentence as an encoded query param", async () => {
    stubFetch(200, "{}");
    await lookupWord("ging", undefined, false, "Ich ging nach Hause.");
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain(
      "sentence=Ich+ging+nach+Hause.",
    );
  });
});

describe("fetchAnkiConnected", () => {
  it("is true only when connected", async () => {
    stubFetch(200, JSON.stringify({ connected: true, version: 6 }));
    expect(await fetchAnkiConnected()).toBe(true);
    stubFetch(200, JSON.stringify({ connected: false, version: null }));
    expect(await fetchAnkiConnected()).toBe(false);
  });

  it("is false when the backend is down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await fetchAnkiConnected()).toBe(false);
  });
});

describe("fetchAiAnswer", () => {
  const RES = {
    lemma: "x",
    pos: "verb",
    article: null,
    plural: null,
    meaning_in_context: "m",
    sentence_translation: "t",
    examples: [{ de: "a", en: "b" }],
    note: null,
  };
  const streamOf = (...chunks: string[]) =>
    new Response(
      new ReadableStream({
        start(c) {
          chunks.forEach((x) => c.enqueue(new TextEncoder().encode(x)));
          c.close();
        },
      }),
    );

  it("splits lines across chunks, counts tokens, clears on retry, handles a final line without newline", async () => {
    const final = JSON.stringify({ result: RES, model: "m1", cached: false });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          streamOf(
            '{"token":"a"}\n{"tok',
            'en":"b"}\n{"retry":true}\n{"token":"c"}\n',
            final,
          ),
        ),
    );
    const log: string[] = [];
    const a = await fetchAiAnswer("w", "s", {
      onToken: () => log.push("t"),
      onRetry: () => log.push("r"),
    });
    expect(log).toEqual(["t", "t", "r", "t"]);
    expect(a).toEqual({ result: RES, model: "m1", cached: false });
  });

  it("throws the error line's message", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          streamOf('{"token":"a"}\n{"error":"Ollama down"}\n'),
        ),
    );
    await expect(fetchAiAnswer("w", "s")).rejects.toThrow("Ollama down");
  });

  it("throws on an HTTP error and on a stream with no result", async () => {
    stubFetch(422, JSON.stringify({ detail: "Sentence is empty" }));
    await expect(fetchAiAnswer("w", "s")).rejects.toThrow("Sentence is empty");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(streamOf('{"token":"a"}\n')),
    );
    await expect(fetchAiAnswer("w", "s")).rejects.toThrow("without a result");
  });
});

describe("addSentenceCard", () => {
  it("posts the card as JSON", async () => {
    stubFetch(200, JSON.stringify({ anki_status: "sent", pending: 0 }));
    const card = {
      sentence_de: "Das Haus.",
      sentence_en: "The house.",
      target_word: "Haus",
      source: "AI example",
    };
    expect(await addSentenceCard(1, card)).toEqual({
      anki_status: "sent",
      pending: 0,
    });
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toMatch(/\/anki\/sentences\?user_id=1$/);
    expect(JSON.parse(init!.body as string)).toEqual(card);
  });

  it("throws the backend's error", async () => {
    stubFetch(422, JSON.stringify({ detail: "bad" }));
    await expect(addSentenceCard(1, {} as never)).rejects.toThrow("bad");
  });
});

describe("unloadsIn", () => {
  const now = Date.parse("2026-11-21T10:00:00Z");
  it("formats minutes", () =>
    expect(unloadsIn("2026-11-21T10:03:00Z", now)).toBe("unloads in 3 min"));
  it("handles under a minute and past dates", () => {
    expect(unloadsIn("2026-11-21T10:00:30Z", now)).toBe(
      "unloads in under a minute",
    );
    expect(unloadsIn("2026-11-21T09:59:00Z", now)).toBe(
      "unloads in under a minute",
    );
  });
  it("detects keep-alive forever", () =>
    expect(unloadsIn("2318-01-01T00:00:00Z", now)).toBe("stays loaded"));
  it("is empty without a date", () => expect(unloadsIn(null, now)).toBe(""));
});
