// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  fetchSentenceTranslation: vi.fn(async () => ""),
  lookupWord: vi.fn(),
  saveWord: vi.fn(),
  fetchUserWords: vi.fn(),
  fetchTranslators: vi.fn(),
  fetchSettings: vi.fn(),
  saveSettings: vi.fn(async () => ({})),
}));

import {
  fetchSettings,
  fetchTranslators,
  lookupWord,
  saveSettings,
} from "@/lib/api";

async function freshStore() {
  vi.resetModules();
  return (await import("@/store/useStore")).default;
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(lookupWord).mockReset();
  vi.mocked(saveSettings).mockClear();
  vi.mocked(fetchSettings).mockResolvedValue({
    translator_priority: null,
    anki_default: null,
  });
});

describe("saved settings", () => {
  it("starts as pons before the server answers", async () => {
    const useStore = await freshStore();
    expect(useStore.getState().translatorPriority).toBe("pons");
  });

  it("applies the saved order and anki default, without a lookup", async () => {
    vi.mocked(fetchSettings).mockResolvedValue({
      translator_priority: ["libretranslate", "pons"],
      anki_default: true,
    });
    const useStore = await freshStore();
    useStore.setState({ selectedWord: "Haus" });
    await useStore.getState().loadSettings();
    expect(useStore.getState().translatorOrder).toEqual([
      "libretranslate",
      "pons",
    ]);
    expect(useStore.getState().translatorPriority).toBe("libretranslate");
    expect(useStore.getState().ankiDefault).toBe(true);
    expect(lookupWord).not.toHaveBeenCalled();
  });

  it("keeps the defaults when the server is down", async () => {
    vi.mocked(fetchSettings).mockRejectedValue(new Error("down"));
    const useStore = await freshStore();
    await useStore.getState().loadSettings();
    expect(useStore.getState().translatorPriority).toBe("pons");
  });

  it("sends old localStorage values up once when the server has none, then removes them", async () => {
    localStorage.setItem("translatorPriority", "libretranslate");
    localStorage.setItem("ankiDefault", "1");
    vi.mocked(saveSettings).mockResolvedValue({
      translator_priority: ["libretranslate"],
      anki_default: true,
    });
    const useStore = await freshStore();
    await useStore.getState().loadSettings();
    expect(saveSettings).toHaveBeenCalledWith({
      translator_priority: ["libretranslate"],
      anki_default: true,
    });
    expect(localStorage.getItem("translatorPriority")).toBeNull();
    expect(localStorage.getItem("ankiDefault")).toBeNull();
    expect(useStore.getState().translatorPriority).toBe("libretranslate");
    expect(useStore.getState().ankiDefault).toBe(true);
  });

  it("ignores and removes old localStorage values when the server has them", async () => {
    localStorage.setItem("translatorPriority", "libretranslate");
    localStorage.setItem("ankiDefault", "1");
    vi.mocked(fetchSettings).mockResolvedValue({
      translator_priority: ["pons"],
      anki_default: false,
    });
    const useStore = await freshStore();
    await useStore.getState().loadSettings();
    expect(saveSettings).not.toHaveBeenCalled();
    expect(localStorage.getItem("translatorPriority")).toBeNull();
    expect(localStorage.getItem("ankiDefault")).toBeNull();
    expect(useStore.getState().translatorPriority).toBe("pons");
    expect(useStore.getState().ankiDefault).toBe(false);
  });

  it("removes the old values even when the upload fails, so it is not retried every load", async () => {
    localStorage.setItem("translatorPriority", "libretranslate");
    vi.mocked(saveSettings).mockRejectedValue(new Error("422"));
    const useStore = await freshStore();
    await useStore.getState().loadSettings();
    expect(localStorage.getItem("translatorPriority")).toBeNull();
    expect(useStore.getState().translatorPriority).toBe("pons");
  });

  it("saves the full order, not only the first", async () => {
    const useStore = await freshStore();
    await useStore.getState().setTranslatorOrder(["b", "c", "a"]);
    expect(saveSettings).toHaveBeenCalledWith({
      translator_priority: ["b", "c", "a"],
    });
    expect(useStore.getState().translatorPriority).toBe("b");
  });

  it("saves the anki default to the server", async () => {
    const useStore = await freshStore();
    useStore.getState().setAnkiDefault(true);
    expect(saveSettings).toHaveBeenCalledWith({ anki_default: true });
    expect(useStore.getState().ankiDefault).toBe(true);
  });

  it("re-looks up the selected word on switch without force, sending the full order", async () => {
    const useStore = await freshStore();
    vi.mocked(lookupWord).mockResolvedValue({} as never);
    useStore.setState({ selectedWord: "Haus" });
    await useStore.getState().setTranslatorPriority("libretranslate");
    expect(lookupWord).toHaveBeenCalledWith(
      "Haus",
      "libretranslate,pons",
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
    const useStore = await freshStore();
    useStore.setState({ translatorOrder: ["libretranslate"] });
    vi.mocked(fetchTranslators).mockResolvedValue([listed[1], listed[0]]);
    await useStore.getState().loadTranslators();
    expect(useStore.getState().translatorPriority).toBe("fakeai");
  });

  it("keeps a saved id that is listed", async () => {
    const useStore = await freshStore();
    useStore.setState({ translatorOrder: ["fakeai", "pons"] });
    vi.mocked(fetchTranslators).mockResolvedValue(listed);
    await useStore.getState().loadTranslators();
    expect(useStore.getState().translatorPriority).toBe("fakeai");
  });

  it("fills a saved single id out to the full order when the list loads first", async () => {
    vi.mocked(fetchSettings).mockResolvedValue({
      translator_priority: ["libretranslate"],
      anki_default: null,
    });
    vi.mocked(fetchTranslators).mockResolvedValue([
      { id: "pons", name: "PONS", note: "" },
      { id: "libretranslate", name: "LibreTranslate", note: "" },
    ]);
    const useStore = await freshStore();
    await useStore.getState().loadTranslators();
    await useStore.getState().loadSettings();
    expect(useStore.getState().translatorOrder).toEqual([
      "libretranslate",
      "pons",
    ]);
    expect(useStore.getState().translatorPriority).toBe("libretranslate");
  });

  it("fills a saved single id out to the full order when settings load first", async () => {
    vi.mocked(fetchSettings).mockResolvedValue({
      translator_priority: ["libretranslate"],
      anki_default: null,
    });
    vi.mocked(fetchTranslators).mockResolvedValue([
      { id: "pons", name: "PONS", note: "" },
      { id: "libretranslate", name: "LibreTranslate", note: "" },
    ]);
    const useStore = await freshStore();
    await useStore.getState().loadSettings();
    await useStore.getState().loadTranslators();
    expect(useStore.getState().translatorOrder).toEqual([
      "libretranslate",
      "pons",
    ]);
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
