import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ fetchSentenceTranslation: vi.fn(), lookupWord: vi.fn(), saveWord: vi.fn(), fetchUserWords: vi.fn(), patchWordStatus: vi.fn() }));

import { fetchSentenceTranslation, lookupWord } from "@/lib/api";
import useStore from "@/store/useStore";

const A = "Er fängt morgen an.";
const B = "Wir gehen nach Hause.";

beforeEach(() => {
  vi.mocked(fetchSentenceTranslation).mockReset();
  vi.mocked(lookupWord).mockReset().mockResolvedValue({ translations: {}, preferred: "pons", source: "pons" } as never);
  useStore.setState({ selectedWord: null, selectedTokens: [], selectedSentence: null, sentenceTranslation: null, sentenceLoading: false, sentenceError: false });
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("sentence translation", () => {
  it("fetches the translation of the clicked sentence without waiting on it", async () => {
    vi.mocked(fetchSentenceTranslation).mockReturnValue(new Promise(() => {}));
    await useStore.getState().setSelectedWord("fängt", A);
    expect(useStore.getState().sentenceLoading).toBe(true);
    expect(useStore.getState().wordLoading).toBe(false);
    vi.mocked(fetchSentenceTranslation).mockResolvedValue("He starts tomorrow.");
    await useStore.getState().setSelectedWord("morgen", A);
    expect(fetchSentenceTranslation).toHaveBeenCalledWith(A);
  });

  it("stores the result", async () => {
    vi.mocked(fetchSentenceTranslation).mockResolvedValue("He starts tomorrow.");
    await useStore.getState().setSelectedWord("fängt", A);
    await flush();
    expect(useStore.getState()).toMatchObject({ sentenceTranslation: "He starts tomorrow.", sentenceLoading: false, sentenceError: false });
  });

  it("ignores an answer for a sentence that is no longer selected", async () => {
    let resolveA!: (v: string) => void;
    vi.mocked(fetchSentenceTranslation).mockReturnValueOnce(new Promise((r) => (resolveA = r)));
    await useStore.getState().setSelectedWord("fängt", A);
    vi.mocked(fetchSentenceTranslation).mockResolvedValueOnce("We go home.");
    await useStore.getState().setSelectedWord("gehen", B);
    await flush();
    resolveA("He starts tomorrow.");
    await flush();
    expect(useStore.getState().sentenceTranslation).toBe("We go home.");
  });

  it("sets an error state when the translation fails", async () => {
    vi.mocked(fetchSentenceTranslation).mockRejectedValue(new Error("down"));
    await useStore.getState().setSelectedWord("fängt", A);
    await flush();
    expect(useStore.getState()).toMatchObject({ sentenceError: true, sentenceLoading: false, sentenceTranslation: null });
  });

  it("a second word in the same sentence reuses the translation", async () => {
    vi.mocked(fetchSentenceTranslation).mockResolvedValue("He starts tomorrow.");
    await useStore.getState().setSelectedWord("fängt", A);
    await flush();
    await useStore.getState().setSelectedWord("morgen", A);
    expect(fetchSentenceTranslation).toHaveBeenCalledTimes(1);
    expect(useStore.getState().sentenceTranslation).toBe("He starts tomorrow.");
  });

  // A -> B -> A leaves two requests for A in flight
  const twoRequestsForA = async () => {
    const res: Array<{ ok: (v: string) => void; fail: (e: Error) => void }> = [];
    vi.mocked(fetchSentenceTranslation).mockImplementation(() => new Promise((ok, fail) => res.push({ ok, fail })));
    await useStore.getState().setSelectedWord("fängt", A);
    await useStore.getState().setSelectedWord("gehen", B);
    await useStore.getState().setSelectedWord("fängt", A);
    return [res[0], res[2]];
  };

  it("an error then a success for the same sentence shows the translation", async () => {
    const [first, second] = await twoRequestsForA();
    first.fail(new Error("500"));
    await flush();
    second.ok("He starts tomorrow.");
    await flush();
    expect(useStore.getState()).toMatchObject({ sentenceTranslation: "He starts tomorrow.", sentenceError: false, sentenceLoading: false });
  });

  it("a success then an error for the same sentence keeps the translation", async () => {
    const [first, second] = await twoRequestsForA();
    first.ok("He starts tomorrow.");
    await flush();
    second.fail(new Error("500"));
    await flush();
    expect(useStore.getState()).toMatchObject({ sentenceTranslation: "He starts tomorrow.", sentenceError: false, sentenceLoading: false });
  });
});
