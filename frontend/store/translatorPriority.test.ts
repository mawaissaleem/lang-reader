// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
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
});
