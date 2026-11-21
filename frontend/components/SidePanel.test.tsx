// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  USER_ID: 1,
  ttsUrl: (t: string) => `/tts?text=${t}`,
  fetchSentenceTranslation: vi.fn(async () => ""),
  lookupWord: vi.fn(),
  saveWord: vi.fn(),
  fetchUserWords: vi.fn(),
  fetchAnkiConnected: vi.fn(async () => true),
  fetchAnkiPending: vi.fn(async () => 2),
  syncAnki: vi.fn(),
  pullAnki: vi.fn(),
  fetchAiAnswer: vi.fn(),
  addSentenceCard: vi.fn(),
}));

import {
  addSentenceCard,
  fetchAiAnswer,
  fetchAnkiConnected,
  fetchUserWords,
  lookupWord,
  pullAnki,
  saveWord,
  syncAnki,
} from "@/lib/api";
import SidePanel from "@/components/SidePanel";
import useStore from "@/store/useStore";

type T = Record<string, { meanings: string[]; word_class: string | null }>;
const both: T = {
  pons: { meanings: ["house"], word_class: "noun" },
  libretranslate: { meanings: ["home"], word_class: null },
};
const result = (translations: T) =>
  ({
    id: 7,
    word: "haus",
    clicked: "haus",
    source: "pons",
    english_meanings: ["house"],
    word_class: "noun",
    translations,
    preferred: "pons",
  }) as never;

function open(translations: T = both) {
  useStore.setState({
    sidePanelOpen: true,
    selectedWord: "haus",
    selectedSentence: null,
    selectedTokens: [],
    wordResult: result(translations),
    activeSource: "pons",
    wordLoading: false,
    wordError: null,
    wordSaved: false,
    sourceError: null,
  });
  render(<SidePanel />);
}

beforeEach(() => {
  vi.mocked(lookupWord).mockReset();
  vi.mocked(saveWord).mockReset();
  vi.mocked(syncAnki).mockReset();
  localStorage.clear();
});
afterEach(cleanup);

describe("SidePanel base form", () => {
  it("shows clicked -> base form only when they differ", () => {
    open();
    expect(screen.queryByText(/→/)).toBeNull();
    cleanup();
    useStore.setState({
      wordResult: {
        ...(result(both) as object),
        word: "gehen",
        clicked: "ging",
      } as never,
    });
    render(<SidePanel />);
    expect(screen.getByText("ging →")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /gehen/ })).toBeTruthy();
  });
});

describe("SidePanel article", () => {
  it("colors the article by gender", () => {
    open();
    cleanup();
    useStore.setState({
      wordResult: {
        ...(result(both) as object),
        word: "Tisch",
        clicked: "Tisch",
        article: "der",
      } as never,
    });
    render(<SidePanel />);
    const article = screen.getByText("der");
    expect(article.className).toContain("text-blue-400");
    expect(screen.getByRole("heading", { name: "der Tisch" })).toBeTruthy();
  });

  it("shows no article when there is none", () => {
    open();
    cleanup();
    useStore.setState({
      wordResult: {
        ...(result(both) as object),
        word: "Tisch",
        clicked: "Tisch",
        article: null,
      } as never,
    });
    render(<SidePanel />);
    expect(screen.getByRole("heading", { name: "Tisch" })).toBeTruthy();
  });
});

describe("SidePanel sentence box", () => {
  it("shows the German sentence with its English translation", () => {
    open();
    act(() =>
      useStore.setState({
        selectedSentence: "Das Haus ist alt.",
        sentenceTranslation: "The house is old.",
        sentenceLoading: false,
        sentenceError: false,
      }),
    );
    expect(screen.getByText("Das Haus ist alt.")).toBeTruthy();
    expect(screen.getByText("The house is old.")).toBeTruthy();
  });

  it("shows Translating… while loading and a quiet error on failure", () => {
    open();
    act(() =>
      useStore.setState({
        selectedSentence: "Das Haus ist alt.",
        sentenceTranslation: null,
        sentenceLoading: true,
        sentenceError: false,
      }),
    );
    expect(screen.getByText("Translating…")).toBeTruthy();
    act(() =>
      useStore.setState({ sentenceLoading: false, sentenceError: true }),
    );
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
    expect(
      screen
        .getByRole("tab", { name: "LibreTranslate" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(lookupWord).not.toHaveBeenCalled();
  });

  it("missing source: Look up calls lookupWord with that priority once and merges", async () => {
    vi.mocked(lookupWord).mockResolvedValue(result(both));
    open({ pons: both.pons });
    fireEvent.click(screen.getByRole("tab", { name: "LibreTranslate" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Look up in LibreTranslate" }),
    );
    await screen.findByText("home");
    expect(lookupWord).toHaveBeenCalledTimes(1);
    expect(lookupWord).toHaveBeenCalledWith(
      "haus",
      "libretranslate",
      false,
      null,
    );
    expect(useStore.getState().wordResult?.translations.pons).toBeTruthy();
    expect(useStore.getState().activeSource).toBe("libretranslate");
  });

  it("shows the backend error when the source is still missing", async () => {
    vi.mocked(lookupWord).mockResolvedValue({
      ...(result({ pons: both.pons }) as object),
      errors: { libretranslate: "Unreachable" },
    } as never);
    open({ pons: both.pons });
    fireEvent.click(screen.getByRole("tab", { name: "LibreTranslate" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Look up in LibreTranslate" }),
    );
    await screen.findByText("Unreachable");
  });

  it("a stale lookupSource for word A does not touch word B", async () => {
    let resolveA!: (v: unknown) => void;
    vi.mocked(lookupWord).mockReturnValueOnce(
      new Promise((r) => (resolveA = r)) as never,
    );
    open({ pons: both.pons });
    const pending = useStore.getState().lookupSource("libretranslate");
    expect(useStore.getState().sourceLoading).toBe(true);

    const baum = {
      id: 8,
      word: "baum",
      clicked: "baum",
      source: "pons",
      translations: { pons: { meanings: ["tree"], word_class: "noun" } },
      preferred: "pons",
    };
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
    fireEvent.click(
      screen.getByRole("button", { name: "Look up in LibreTranslate" }),
    );
    const priority = useStore.getState().setTranslatorPriority("pons");

    resolveSource({
      ...(result({ pons: both.pons }) as object),
      errors: { libretranslate: "Unreachable" },
    });
    await Promise.resolve();
    resolvePriority(result({ pons: both.pons }));
    await priority;

    expect(useStore.getState().sourceLoading).toBe(false);
    fireEvent.click(await screen.findByRole("tab", { name: "LibreTranslate" }));
    expect(
      (
        screen.getByRole("button", {
          name: "Look up in LibreTranslate",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("saves the active tab's source", async () => {
    vi.mocked(saveWord).mockResolvedValue({
      message: "ok",
      already_saved: false,
      anki_status: "none",
    });
    open();
    fireEvent.click(screen.getByRole("tab", { name: "LibreTranslate" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(saveWord).toHaveBeenCalledWith(
        7,
        1,
        "libretranslate",
        undefined,
        false,
      ),
    );
  });
});

describe("SidePanel anki status", () => {
  it("shows connected when the backend says so", async () => {
    open();
    await waitFor(() =>
      expect(screen.getByTestId("anki-status").textContent).toBe(
        "Anki connected",
      ),
    );
  });

  it("shows not connected otherwise", async () => {
    vi.mocked(fetchAnkiConnected).mockResolvedValueOnce(false);
    open();
    await waitFor(() => expect(fetchAnkiConnected).toHaveBeenCalled());
    expect(screen.getByTestId("anki-status").textContent).toBe(
      "Anki not connected",
    );
  });
});

describe("SidePanel Anki outbox", () => {
  it("Save + Anki sends the flag", async () => {
    vi.mocked(saveWord).mockResolvedValue({
      message: "ok",
      already_saved: false,
      anki_status: "pending",
    });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save + Anki" }));
    await waitFor(() =>
      expect(saveWord).toHaveBeenCalledWith(7, 1, "pons", undefined, true),
    );
  });

  it("the default checkbox makes Save + Anki primary and persists", () => {
    open();
    const btn = () => screen.getByRole("button", { name: "Save + Anki" });
    expect(btn().className).not.toContain("bg-blue-500 ");
    fireEvent.click(screen.getByLabelText("Make Save + Anki the default"));
    expect(btn().className).toContain("bg-blue-500 ");
    expect(localStorage.getItem("ankiDefault")).toBe("1");
  });

  it("shows the pending count and Sync delivers", async () => {
    vi.mocked(syncAnki).mockResolvedValue({ sent: 2, failed: 0, pending: 0 });
    open();
    await waitFor(() =>
      expect(screen.getByTestId("anki-pending").textContent).toBe(
        "2 cards waiting for Anki",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sync to Anki" }));
    await screen.findByText("Sent 2");
    expect(screen.getByTestId("anki-pending").textContent).toBe(
      "0 cards waiting for Anki",
    );
  });

  it("Pull from Anki reports how many words changed", async () => {
    vi.mocked(pullAnki).mockResolvedValue({ changed: 3, checked: 5 });
    vi.mocked(fetchUserWords).mockReset().mockResolvedValue([]);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Pull from Anki" }));
    await screen.findByText("3 of 5 words updated from Anki");
    expect(fetchUserWords).toHaveBeenCalledWith(1);
  });

  it("keeps the success message when the reload after a pull fails", async () => {
    vi.mocked(pullAnki).mockResolvedValue({ changed: 3, checked: 5 });
    vi.mocked(fetchUserWords).mockReset().mockRejectedValue(new Error("boom"));
    open();
    fireEvent.click(screen.getByRole("button", { name: "Pull from Anki" }));
    await screen.findByText("3 of 5 words updated from Anki");
    await waitFor(() => expect(fetchUserWords).toHaveBeenCalled());
    expect(screen.queryByText("boom")).toBeNull();
  });

  it("shows the error when Anki is closed", async () => {
    vi.mocked(syncAnki).mockRejectedValue(new Error("Anki is not reachable"));
    open();
    await waitFor(() =>
      expect(screen.getByTestId("anki-pending").textContent).toContain("2"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sync to Anki" }));
    await screen.findByText("Anki is not reachable");
  });
});

describe("SidePanel AI tab", () => {
  const answer = {
    result: {
      lemma: "haus",
      pos: "noun",
      article: "das",
      plural: "Häuser",
      meaning_in_context: "a building",
      sentence_translation: "The house is big.",
      examples: [{ de: "Das Haus ist alt.", en: "The house is old." }],
      note: "neuter noun",
    },
    model: "qwen",
    cached: false,
  };

  function openAi(word = "haus") {
    useStore.setState({ ai: {} });
    open();
    act(() =>
      useStore.setState({
        selectedWord: word,
        selectedSentence: "Das Haus ist groß.",
        activeSource: "ai",
      }),
    );
  }

  beforeEach(() => vi.mocked(fetchAiAnswer).mockReset());

  it("never asks on its own, shows loading then the result and the model", async () => {
    let done!: (a: typeof answer) => void;
    vi.mocked(fetchAiAnswer).mockReturnValue(new Promise((r) => (done = r)));
    openAi();
    expect(fetchAiAnswer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Get examples" }));
    expect(screen.getByText(/Asking the model/)).toBeTruthy();
    await act(async () => done(answer));
    expect(screen.getByText("a building")).toBeTruthy();
    expect(screen.getByText("The house is old.")).toBeTruthy();
    expect(screen.getByText("neuter noun")).toBeTruthy();
    expect(screen.getByText("answered by qwen")).toBeTruthy();
  });

  it("keeps the in-flight request and result across tab switches", async () => {
    let done!: (a: typeof answer) => void;
    vi.mocked(fetchAiAnswer).mockReturnValue(new Promise((r) => (done = r)));
    openAi();
    fireEvent.click(screen.getByRole("button", { name: "Get examples" }));
    fireEvent.click(screen.getByRole("tab", { name: "PONS" }));
    fireEvent.click(screen.getByRole("tab", { name: "AI" }));
    expect(screen.getByText(/Asking the model/)).toBeTruthy();
    await act(async () => done(answer));
    fireEvent.click(screen.getByRole("tab", { name: "PONS" }));
    fireEvent.click(screen.getByRole("tab", { name: "AI" }));
    expect(screen.getByText("a building")).toBeTruthy();
    expect(fetchAiAnswer).toHaveBeenCalledTimes(1);
  });

  it("does not show one word's answer for another word", async () => {
    vi.mocked(fetchAiAnswer).mockResolvedValue(answer);
    openAi();
    fireEvent.click(screen.getByRole("button", { name: "Get examples" }));
    await screen.findByText("a building");
    act(() => useStore.setState({ selectedWord: "tisch" }));
    expect(screen.queryByText("a building")).toBeNull();
    expect(screen.getByRole("button", { name: "Get examples" })).toBeTruthy();
  });

  it("shows the error and retries", async () => {
    vi.mocked(fetchAiAnswer)
      .mockRejectedValueOnce(new Error("Ollama down"))
      .mockResolvedValueOnce(answer);
    openAi();
    fireEvent.click(screen.getByRole("button", { name: "Get examples" }));
    await screen.findByText("Ollama down");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("a building");
    expect(fetchAiAnswer).toHaveBeenCalledTimes(2);
  });

  it("shows the sentence once and adds an example to Anki", async () => {
    vi.mocked(fetchAiAnswer).mockResolvedValue(answer);
    vi.mocked(addSentenceCard).mockResolvedValue({
      anki_status: "pending",
      pending: 3,
    });
    openAi();
    act(() => useStore.setState({ sentenceTranslation: "other translation" }));
    fireEvent.click(screen.getByRole("button", { name: "Get examples" }));
    await screen.findByText("a building");
    expect(screen.getAllByText("Das Haus ist groß.")).toHaveLength(1);
    expect(screen.queryByTestId("sentence-box")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "+ Anki" }));
    await screen.findByText("Waiting for Anki");
    expect(addSentenceCard).toHaveBeenCalledWith(1, {
      sentence_de: "Das Haus ist alt.",
      sentence_en: "The house is old.",
      target_word: "haus",
      source: "AI example",
      bold: [],
    });
  });
});

describe("SidePanel reader sentence", () => {
  beforeEach(() => vi.mocked(addSentenceCard).mockReset());

  it("adds the highlighted sentence with the text title and base form", async () => {
    vi.mocked(addSentenceCard).mockResolvedValue({
      anki_status: "sent",
      pending: 0,
    });
    useStore.setState({ title: "Mein Text", sentenceCards: {} });
    open();
    act(() =>
      useStore.setState({
        selectedSentence: "Das Haus ist alt.",
        sentenceTranslation: "The house is old.",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "+ Anki" }));
    await screen.findByText("✓ In Anki");
    expect(addSentenceCard).toHaveBeenCalledWith(1, {
      sentence_de: "Das Haus ist alt.",
      sentence_en: "The house is old.",
      target_word: "haus",
      source: "Mein Text",
      bold: ["haus"],
    });
  });

  it("sends the clicked surface forms to bold, not the base form", async () => {
    vi.mocked(addSentenceCard).mockResolvedValue({
      anki_status: "sent",
      pending: 0,
    });
    useStore.setState({ title: "Mein Text", sentenceCards: {} });
    open();
    act(() =>
      useStore.setState({
        selectedSentence: "Er fängt morgen an.",
        sentenceTranslation: "He starts tomorrow.",
        selectedTokens: [
          { id: "0:1", word: "fängt" },
          { id: "0:3", word: "an" },
        ],
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "+ Anki" }));
    await screen.findByText("✓ In Anki");
    expect(vi.mocked(addSentenceCard).mock.calls[0][1].bold).toEqual([
      "fängt",
      "an",
    ]);
  });

  it("offers no button until the translation is there", () => {
    useStore.setState({ sentenceCards: {} });
    open();
    act(() =>
      useStore.setState({
        selectedSentence: "Das Haus ist alt.",
        sentenceTranslation: null,
      }),
    );
    expect(screen.queryByRole("button", { name: "+ Anki" })).toBeNull();
  });
});
