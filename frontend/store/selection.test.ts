import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ fetchSentenceTranslation: vi.fn(async () => ""), lookupWord: vi.fn(), saveWord: vi.fn(), fetchUserWords: vi.fn(), patchWordStatus: vi.fn() }));

import { lookupWord } from "@/lib/api";
import useStore from "@/store/useStore";

const S = "Er fängt morgen an.";
const t = (id: string, word: string) => ({ id, word });

beforeEach(() => {
  vi.mocked(lookupWord).mockReset().mockResolvedValue({ translations: {}, preferred: "pons", source: "pons" } as never);
  useStore.setState({ selectedWord: null, selectedTokens: [], selectedSentence: null });
});

describe("extendSelection", () => {
  it("looks up the shift-selected words, in text order, as one phrase", async () => {
    const { setSelectedWord, extendSelection } = useStore.getState();
    await setSelectedWord("fängt", S, [t("0:2", "fängt")]);
    await extendSelection(t("0:8", "an"), S);
    expect(lookupWord).toHaveBeenLastCalledWith("fängt an", 1, expect.anything(), false, S);
    expect(useStore.getState().selectedTokens.map((x) => x.id)).toEqual(["0:2", "0:8"]);
  });

  it("a plain click resets to a single selection", async () => {
    const { setSelectedWord, extendSelection } = useStore.getState();
    await setSelectedWord("fängt", S, [t("0:2", "fängt")]);
    await extendSelection(t("0:8", "an"), S);
    await useStore.getState().setSelectedWord("morgen", S, [t("0:4", "morgen")]);
    expect(useStore.getState().selectedWord).toBe("morgen");
    expect(useStore.getState().selectedTokens).toHaveLength(1);
  });

  it("shift+click in another paragraph starts a new selection", async () => {
    await useStore.getState().setSelectedWord("fängt", S, [t("0:2", "fängt")]);
    await useStore.getState().extendSelection(t("1:0", "Hallo"), "Hallo Welt.");
    expect(useStore.getState().selectedWord).toBe("Hallo");
    expect(useStore.getState().selectedTokens).toEqual([t("1:0", "Hallo")]);
  });

  it("shift+click in another sentence of the same paragraph starts a new selection", async () => {
    await useStore.getState().setSelectedWord("fängt", S, [t("0:2", "fängt")]);
    await useStore.getState().extendSelection(t("0:12", "Wir"), "Wir gehen.");
    expect(useStore.getState().selectedWord).toBe("Wir");
  });
});
