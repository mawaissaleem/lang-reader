// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  fetchSentenceTranslation: vi.fn(async () => ""),
  lookupWord: vi.fn(),
  saveWord: vi.fn(),
  fetchUserWords: vi.fn(),
}));

import { lookupWord } from "@/lib/api";

async function freshStore() {
  vi.resetModules();
  return (await import("@/store/useStore")).default;
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(lookupWord).mockReset();
});

describe("translatorPriority hydration", () => {
  it("starts as pons even when localStorage holds libretranslate at import", async () => {
    localStorage.setItem("translatorPriority", "libretranslate");
    const useStore = await freshStore();
    expect(useStore.getState().translatorPriority).toBe("pons");
  });

  it("applies a valid stored value on load, without a lookup", async () => {
    localStorage.setItem("translatorPriority", "libretranslate");
    const useStore = await freshStore();
    useStore.setState({ selectedWord: "Haus" });
    useStore.getState().loadTranslatorPriority();
    expect(useStore.getState().translatorPriority).toBe("libretranslate");
    expect(lookupWord).not.toHaveBeenCalled();
  });

  it("ignores an invalid stored value", async () => {
    localStorage.setItem("translatorPriority", "bogus");
    const useStore = await freshStore();
    useStore.getState().loadTranslatorPriority();
    expect(useStore.getState().translatorPriority).toBe("pons");
  });

  it("re-looks up the selected word on switch without force", async () => {
    const useStore = await freshStore();
    vi.mocked(lookupWord).mockResolvedValue({} as never);
    useStore.setState({ selectedWord: "Haus" });
    await useStore.getState().setTranslatorPriority("libretranslate");
    expect(lookupWord).toHaveBeenCalledWith(
      "Haus",
      expect.anything(),
      "libretranslate",
      false,
      null,
    );
  });
});

describe("stale lookups", () => {
  it("keeps the newer word's result when the older answer arrives last", async () => {
    const useStore = await freshStore();
    let resolveA!: (v: never) => void;
    vi.mocked(lookupWord).mockImplementation((w: string) =>
      w === "A"
        ? new Promise((r) => (resolveA = r as never))
        : Promise.resolve({
            id: 2,
            word: "B",
            preferred: "pons",
            source: "pons",
            translations: { pons: {} },
          } as never),
    );
    const a = useStore.getState().setSelectedWord("A");
    await useStore.getState().setSelectedWord("B");
    resolveA({
      id: 1,
      word: "A",
      preferred: "pons",
      source: "pons",
      translations: { pons: {} },
    } as never);
    await a;
    expect(useStore.getState().wordResult?.word).toBe("B");
    expect(useStore.getState().wordLoading).toBe(false);
  });
});
