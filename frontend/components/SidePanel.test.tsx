// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ fetchSentenceTranslation: vi.fn(async () => ""), lookupWord: vi.fn(), saveWord: vi.fn(), fetchUserWords: vi.fn() }));

import { lookupWord, saveWord } from "@/lib/api";
import SidePanel from "@/components/SidePanel";
import useStore from "@/store/useStore";

type T = Record<string, { meanings: string[]; word_class: string | null }>;
const both: T = {
  pons: { meanings: ["house"], word_class: "noun" },
  libretranslate: { meanings: ["home"], word_class: null },
};
const result = (translations: T) =>
  ({ id: 7, word: "haus", clicked: "haus", source: "pons", english_meanings: ["house"], word_class: "noun", translations, preferred: "pons" }) as never;

function open(translations: T = both) {
  useStore.setState({
    sidePanelOpen: true, selectedWord: "haus", selectedSentence: null, wordResult: result(translations),
    activeSource: "pons", wordLoading: false, wordError: null, wordSaved: false, sourceError: null,
  });
  render(<SidePanel />);
}

beforeEach(() => {
  vi.mocked(lookupWord).mockReset();
  vi.mocked(saveWord).mockReset();
});
afterEach(cleanup);

describe("SidePanel base form", () => {
  it("shows clicked -> base form only when they differ", () => {
    open();
    expect(screen.queryByText(/→/)).toBeNull();
    cleanup();
    useStore.setState({ wordResult: { ...(result(both) as object), word: "gehen", clicked: "ging" } as never });
    render(<SidePanel />);
    expect(screen.getByText("ging →")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /gehen/ })).toBeTruthy();
  });
});

describe("SidePanel article", () => {
  it("colors the article by gender", () => {
    open();
    cleanup();
    useStore.setState({ wordResult: { ...(result(both) as object), word: "Tisch", clicked: "Tisch", article: "der" } as never });
    render(<SidePanel />);
    const article = screen.getByText("der");
    expect(article.className).toContain("text-blue-400");
    expect(screen.getByRole("heading", { name: "der Tisch" })).toBeTruthy();
  });

  it("shows no article when there is none", () => {
    open();
    cleanup();
    useStore.setState({ wordResult: { ...(result(both) as object), word: "Tisch", clicked: "Tisch", article: null } as never });
    render(<SidePanel />);
    expect(screen.getByRole("heading", { name: "Tisch" })).toBeTruthy();
  });
});

describe("SidePanel sentence box", () => {
  it("shows the German sentence with its English translation", () => {
    open();
    act(() => useStore.setState({ selectedSentence: "Das Haus ist alt.", sentenceTranslation: "The house is old.", sentenceLoading: false, sentenceError: false }));
    expect(screen.getByText("Das Haus ist alt.")).toBeTruthy();
    expect(screen.getByText("The house is old.")).toBeTruthy();
  });

  it("shows Translating… while loading and a quiet error on failure", () => {
    open();
    act(() => useStore.setState({ selectedSentence: "Das Haus ist alt.", sentenceTranslation: null, sentenceLoading: true, sentenceError: false }));
    expect(screen.getByText("Translating…")).toBeTruthy();
    act(() => useStore.setState({ sentenceLoading: false, sentenceError: true }));
    expect(screen.getByText("Couldn't translate the sentence")).toBeTruthy();
    expect(screen.getByText("house")).toBeTruthy();
  });
});

describe("SidePanel source tabs", () => {
  it("switches tabs without re-querying", () => {
    open();
    expect(screen.getByText("house")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "LibreTranslate" }));
    expect(screen.getByText("home")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "LibreTranslate" }).getAttribute("aria-selected")).toBe("true");
    expect(lookupWord).not.toHaveBeenCalled();
  });

  it("missing source: Look up calls lookupWord with that priority once and merges", async () => {
    vi.mocked(lookupWord).mockResolvedValue(result(both));
    open({ pons: both.pons });
    fireEvent.click(screen.getByRole("tab", { name: "LibreTranslate" }));
    fireEvent.click(screen.getByRole("button", { name: "Look up in LibreTranslate" }));
    await screen.findByText("home");
    expect(lookupWord).toHaveBeenCalledTimes(1);
    expect(lookupWord).toHaveBeenCalledWith("haus", 1, "libretranslate", false, null);
    expect(useStore.getState().wordResult?.translations.pons).toBeTruthy();
    expect(useStore.getState().activeSource).toBe("libretranslate");
  });

  it("shows the backend error when the source is still missing", async () => {
    vi.mocked(lookupWord).mockResolvedValue({ ...(result({ pons: both.pons }) as object), errors: { libretranslate: "Unreachable" } } as never);
    open({ pons: both.pons });
    fireEvent.click(screen.getByRole("tab", { name: "LibreTranslate" }));
    fireEvent.click(screen.getByRole("button", { name: "Look up in LibreTranslate" }));
    await screen.findByText("Unreachable");
  });

  it("a stale lookupSource for word A does not touch word B", async () => {
    let resolveA!: (v: unknown) => void;
    vi.mocked(lookupWord).mockReturnValueOnce(new Promise((r) => (resolveA = r)) as never);
    open({ pons: both.pons });
    const pending = useStore.getState().lookupSource("libretranslate");
    expect(useStore.getState().sourceLoading).toBe(true);

    const baum = { id: 8, word: "baum", clicked: "baum", source: "pons", translations: { pons: { meanings: ["tree"], word_class: "noun" } }, preferred: "pons" };
    vi.mocked(lookupWord).mockResolvedValueOnce(baum as never);
    await useStore.getState().setSelectedWord("baum");

    resolveA(result(both));
    await pending;
    const s = useStore.getState();
    expect(Object.keys(s.wordResult!.translations)).toEqual(["pons"]);
    expect(s.wordResult!.translations.pons.meanings).toEqual(["tree"]);
    expect(s.sourceLoading).toBe(false);
    expect(s.sourceError).toBeNull();
  });

  it("changing the translator during a source lookup does not leave it loading", async () => {
    let resolveSource!: (v: unknown) => void;
    let resolvePriority!: (v: unknown) => void;
    vi.mocked(lookupWord)
      .mockReturnValueOnce(new Promise((r) => (resolveSource = r)) as never)
      .mockReturnValueOnce(new Promise((r) => (resolvePriority = r)) as never);
    open({ pons: both.pons });
    fireEvent.click(screen.getByRole("tab", { name: "LibreTranslate" }));
    fireEvent.click(screen.getByRole("button", { name: "Look up in LibreTranslate" }));
    const priority = useStore.getState().setTranslatorPriority("pons");

    resolveSource({ ...(result({ pons: both.pons }) as object), errors: { libretranslate: "Unreachable" } });
    await Promise.resolve();
    resolvePriority(result({ pons: both.pons }));
    await priority;

    expect(useStore.getState().sourceLoading).toBe(false);
    fireEvent.click(await screen.findByRole("tab", { name: "LibreTranslate" }));
    expect((screen.getByRole("button", { name: "Look up in LibreTranslate" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("saves the active tab's source", async () => {
    vi.mocked(saveWord).mockResolvedValue({ message: "ok", already_saved: false });
    open();
    fireEvent.click(screen.getByRole("tab", { name: "LibreTranslate" }));
    fireEvent.click(screen.getByRole("button", { name: "Save to dictionary" }));
    await waitFor(() => expect(saveWord).toHaveBeenCalledWith(7, 1, "libretranslate", undefined));
  });
});
