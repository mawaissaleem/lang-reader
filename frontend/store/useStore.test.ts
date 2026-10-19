import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  lookupWord: vi.fn(),
  saveWord: vi.fn(),
  fetchUserWords: vi.fn(),
}));

import { saveWord } from "@/lib/api";
import useStore from "@/store/useStore";

const result = { id: 7, word: "Haus", english_meanings: ["house"] } as never;

beforeEach(() => {
  vi.mocked(saveWord).mockReset();
  useStore.setState({ wordResult: result, wordSaved: false, wordSaving: false, saveError: null, knownWords: new Set() });
});

describe("saveSelectedWord", () => {
  it("marks word saved and known on success", async () => {
    vi.mocked(saveWord).mockResolvedValue({ message: "ok", already_saved: false });
    await useStore.getState().saveSelectedWord();
    const s = useStore.getState();
    expect(s.wordSaved).toBe(true);
    expect(s.knownWords.has("haus")).toBe(true);
  });

  it("sets saveError and keeps the meaning on failure", async () => {
    vi.mocked(saveWord).mockRejectedValue(new Error("boom"));
    await useStore.getState().saveSelectedWord();
    const s = useStore.getState();
    expect(s.saveError).toBe("boom");
    expect(s.wordSaved).toBe(false);
    expect(s.wordSaving).toBe(false);
    expect(s.wordResult).toBe(result);
  });
});
