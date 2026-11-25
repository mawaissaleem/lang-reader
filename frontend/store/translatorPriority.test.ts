// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  fetchSentenceTranslation: vi.fn(async () => ""),
  lookupWord: vi.fn(),
  saveWord: vi.fn(),
  fetchUserWords: vi.fn(),
  fetchTranslators: vi.fn(),
}));

import { fetchTranslators, lookupWord } from "@/lib/api";

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
    useStore.setState({
      translators: [{ id: "pons", name: "PONS", note: "" }],
    });
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
      "libretranslate",
      false,
      null,
    );
  });
});

describe("translator list", () => {
  const listed = [
    { id: "pons", name: "PONS", note: "" },
    { id: "fakeai", name: "Fake AI", note: "" },
  ];

  it("falls back to the first listed when the saved id is unknown", async () => {
    localStorage.setItem("translatorPriority", "libretranslate");
    const useStore = await freshStore();
    useStore.getState().loadTranslatorPriority();
    vi.mocked(fetchTranslators).mockResolvedValue([listed[1], listed[0]]);
    await useStore.getState().loadTranslators();
    expect(useStore.getState().translatorPriority).toBe("fakeai");
  });

  it("keeps a saved id that is listed", async () => {
    localStorage.setItem("translatorPriority", "fakeai");
    const useStore = await freshStore();
    vi.mocked(fetchTranslators).mockResolvedValue(listed);
    await useStore.getState().loadTranslators();
    useStore.getState().loadTranslatorPriority();
    expect(useStore.getState().translatorPriority).toBe("fakeai");
  });

  it("keeps working with an empty list when the fetch fails", async () => {
    const useStore = await freshStore();
    vi.mocked(fetchTranslators).mockRejectedValue(new Error("down"));
    await useStore.getState().loadTranslators();
    expect(useStore.getState().translators).toEqual([]);
    expect(useStore.getState().translatorPriority).toBe("pons");
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
