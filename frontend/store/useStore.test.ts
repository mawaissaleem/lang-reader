import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  USER_ID: 1,
  fetchSentenceTranslation: vi.fn(async () => ""),
  lookupWord: vi.fn(),
  saveWord: vi.fn(),
  fetchUserWords: vi.fn(),
  patchWordStatus: vi.fn(),
  addSentenceCard: vi.fn(),
}));

import {
  addSentenceCard,
  lookupWord,
  saveWord,
  fetchUserWords,
  patchWordStatus,
} from "@/lib/api";
import useStore from "@/store/useStore";

const result = {
  id: 7,
  word: "Haus",
  clicked: "Haus",
  english_meanings: ["house"],
} as never;

beforeEach(() => {
  vi.mocked(saveWord).mockReset();
  useStore.setState({
    wordResult: result,
    wordSaved: false,
    wordSaving: false,
    saveError: null,
    userWords: {},
  });
});

describe("saveSelectedWord", () => {
  it("sends the clicked sentence and text ref", async () => {
    vi.mocked(saveWord).mockResolvedValue({
      message: "ok",
      already_saved: false,
      anki_status: "none",
    });
    vi.mocked(fetchUserWords).mockResolvedValue([]);
    useStore.setState({
      selectedSentence: "Das Haus ist alt.",
      selectedTextRef: { kind: "text", id: 5 },
      activeSource: "pons",
    });
    await useStore.getState().saveSelectedWord();
    expect(saveWord).toHaveBeenCalledWith(
      7,
      1,
      "pons",
      {
        form: "Haus",
        context_sentence: "Das Haus ist alt.",
        text_kind: "text",
        text_id: 5,
      },
      false,
    );
  });

  it("sends no source on the AI tab", async () => {
    vi.mocked(saveWord).mockResolvedValue({
      message: "ok",
      already_saved: false,
      anki_status: "none",
    });
    vi.mocked(fetchUserWords).mockResolvedValue([]);
    useStore.setState({ selectedSentence: null, activeSource: "ai" });
    await useStore.getState().saveSelectedWord();
    expect(vi.mocked(saveWord).mock.calls[0][2]).toBeUndefined();
  });

  it("keeps the text ref from click time when another text opens before save", async () => {
    vi.mocked(lookupWord).mockResolvedValue({
      ...(result as object),
      translations: {},
      preferred: "pons",
      source: "pons",
    } as never);
    vi.mocked(saveWord).mockResolvedValue({
      message: "ok",
      already_saved: false,
      anki_status: "none",
    });
    vi.mocked(fetchUserWords).mockResolvedValue([]);
    useStore
      .getState()
      .setText("Der Hund bellt.", "A", { kind: "text", id: 1 });
    await useStore.getState().setSelectedWord("Haus", "Der Hund bellt.");
    useStore
      .getState()
      .setText("Andere Geschichte.", "B", { kind: "video", id: 2 });
    await useStore.getState().saveSelectedWord();
    expect(saveWord).toHaveBeenCalledWith(
      7,
      1,
      "pons",
      {
        form: "Haus",
        context_sentence: "Der Hund bellt.",
        text_kind: "text",
        text_id: 1,
      },
      false,
    );
  });

  it("passes the anki flag and reports a rejected note", async () => {
    vi.mocked(saveWord).mockResolvedValue({
      message: "ok",
      already_saved: false,
      anki_status: "failed",
    });
    vi.mocked(fetchUserWords).mockResolvedValue([]);
    await useStore.getState().saveSelectedWord(true);
    expect(vi.mocked(saveWord).mock.calls[0][4]).toBe(true);
    expect(useStore.getState().saveError).toMatch(/Anki rejected/);
  });

  it("sends only the clicked form when no sentence was captured", async () => {
    vi.mocked(saveWord).mockResolvedValue({
      message: "ok",
      already_saved: false,
      anki_status: "none",
    });
    vi.mocked(fetchUserWords).mockResolvedValue([]);
    useStore.setState({ selectedSentence: null, activeSource: null });
    await useStore.getState().saveSelectedWord();
    expect(saveWord).toHaveBeenCalledWith(
      7,
      1,
      undefined,
      { form: "Haus" },
      false,
    );
  });

  it("does not mark a newer word saved when the click changed during the save", async () => {
    vi.mocked(fetchUserWords).mockResolvedValue([]);
    vi.mocked(saveWord).mockImplementation(async () => {
      useStore.setState({
        wordResult: { id: 8, word: "Baum", clicked: "Baum" } as never,
      });
      return { message: "ok", already_saved: false, anki_status: "none" };
    });
    await useStore.getState().saveSelectedWord();
    expect(useStore.getState().wordSaved).toBe(false);
    expect(useStore.getState().wordSaving).toBe(false);
  });

  it("marks word saved and known on success", async () => {
    vi.mocked(saveWord).mockResolvedValue({
      message: "ok",
      already_saved: false,
      anki_status: "none",
    });
    vi.mocked(fetchUserWords).mockResolvedValue([
      { id: 3, word: "Haus", status: "learning1" },
    ] as never);
    await useStore.getState().saveSelectedWord();
    const s = useStore.getState();
    expect(s.wordSaved).toBe(true);
    expect(s.userWords.Haus).toEqual({ id: 3, status: "learning1" });
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

describe("lookup with sentence", () => {
  it("sends the clicked sentence to the lookup", async () => {
    vi.mocked(lookupWord).mockResolvedValue({
      ...(result as object),
      translations: {},
      preferred: "pons",
      source: "pons",
    } as never);
    await useStore.getState().setSelectedWord("ging", "Ich ging nach Hause.");
    expect(lookupWord).toHaveBeenCalledWith(
      "ging",
      "pons",
      false,
      "Ich ging nach Hause.",
    );
  });

  it("a late particle lookup from an earlier click leaves the newer selection alone", async () => {
    let resolveFirst: (v: never) => void = () => {};
    const withParticle = {
      ...(result as object),
      translations: {},
      preferred: "pons",
      source: "pons",
      particle: "an",
      particle_skip: 0,
    };
    vi.mocked(lookupWord)
      .mockReset()
      .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
      .mockResolvedValue({ ...withParticle, particle: undefined } as never);
    const findFirst = vi.fn(() => ({ id: "0:6", word: "an" }));
    // the same word in two sentences: the first lookup resolves after the second click
    const first = useStore
      .getState()
      .setSelectedWord(
        "fängt",
        "Er fängt an.",
        [{ id: "0:2", word: "fängt" }],
        findFirst,
      );
    const newer = [{ id: "1:2", word: "fängt" }];
    await useStore.getState().setSelectedWord("fängt", "Sie fängt nie.", newer);
    resolveFirst(withParticle as never);
    await first;
    expect(findFirst).not.toHaveBeenCalled();
    expect(useStore.getState().selectedTokens).toBe(newer);
    expect(lookupWord).toHaveBeenCalledTimes(2);
  });

  it("status of an inflected click applies to the saved base form", async () => {
    vi.mocked(patchWordStatus).mockResolvedValue(undefined as never);
    useStore.setState({
      selectedWord: "ging",
      wordResult: { id: 7, word: "gehen", clicked: "ging" } as never,
      userWords: { gehen: { id: 4, status: "learning1" } },
    });
    await useStore.getState().setWordStatus("known");
    expect(patchWordStatus).toHaveBeenCalledWith(4, "known", "ging");
    expect(useStore.getState().userWords.ging).toEqual({
      id: 4,
      status: "known",
    });
  });

  it("saving an inflected click colors the clicked form after the reload", async () => {
    vi.mocked(saveWord).mockResolvedValue({
      message: "ok",
      already_saved: false,
      anki_status: "none",
    });
    vi.mocked(fetchUserWords).mockResolvedValue([
      { id: 4, word: "gehen", status: "learning1" },
    ] as never);
    useStore.setState({
      wordResult: { id: 7, word: "gehen", clicked: "Ging" } as never,
      userWords: {},
    });
    await useStore.getState().saveSelectedWord();
    expect(useStore.getState().userWords.ging).toEqual({
      id: 4,
      status: "learning1",
    });
  });
});

describe("loadUserWords", () => {
  it("colours saved clicked forms, and a saved word beats another word's form", async () => {
    vi.mocked(fetchUserWords).mockResolvedValue([
      { id: 1, word: "der", status: "known", forms: ["den", "die"] },
      { id: 2, word: "die", status: "learning1", forms: [] },
    ] as never);
    await useStore.getState().loadUserWords(1);
    const { userWords } = useStore.getState();
    expect(userWords.den).toEqual({ id: 1, status: "known" });
    expect(userWords.die).toEqual({ id: 2, status: "learning1" });
  });
});

describe("setWordStatus", () => {
  beforeEach(() => {
    vi.mocked(patchWordStatus).mockReset();
    useStore.setState({
      selectedWord: "Haus",
      userWords: { Haus: { id: 3, status: "learning1" } },
    });
  });

  it("updates optimistically and calls PATCH", async () => {
    let seen = "";
    vi.mocked(patchWordStatus).mockImplementation(async () => {
      seen = useStore.getState().userWords.Haus.status;
    });
    await useStore.getState().setWordStatus("known");
    expect(seen).toBe("known");
    expect(patchWordStatus).toHaveBeenCalledWith(3, "known", "Haus");
  });

  it("reverts and sets saveError on failure", async () => {
    vi.mocked(patchWordStatus).mockRejectedValue(new Error("nope"));
    await useStore.getState().setWordStatus("ignored");
    expect(useStore.getState().userWords.Haus.status).toBe("learning1");
    expect(useStore.getState().saveError).toBe("nope");
  });

  it("saves an unsaved word first, then sets the status", async () => {
    useStore.setState({ userWords: {} });
    vi.mocked(saveWord).mockResolvedValue({
      message: "ok",
      already_saved: false,
      anki_status: "none",
    });
    vi.mocked(fetchUserWords).mockResolvedValue([
      { id: 9, word: "Haus", status: "learning1" },
    ] as never);
    vi.mocked(patchWordStatus).mockResolvedValue();
    await useStore.getState().setWordStatus("learning3");
    expect(patchWordStatus).toHaveBeenCalledWith(9, "learning3", "Haus");
    expect(useStore.getState().userWords.Haus.status).toBe("learning3");
  });
});

describe("addSentenceCard", () => {
  const key = "Haus\nDas Haus ist alt.";
  const add = () =>
    useStore
      .getState()
      .addSentenceCard(
        "Das Haus ist alt.",
        "The house is old.",
        "Haus",
        "AI example",
      );

  it("posts the card and keeps the returned state", async () => {
    vi.mocked(addSentenceCard).mockResolvedValue({
      anki_status: "pending",
      pending: 1,
    });
    await add();
    expect(addSentenceCard).toHaveBeenCalledWith(1, {
      sentence_de: "Das Haus ist alt.",
      sentence_en: "The house is old.",
      target_word: "Haus",
      source: "AI example",
      bold: [],
    });
    expect(useStore.getState().sentenceCards[key]).toBe("pending");
  });

  it("marks a failed request so it can be retried", async () => {
    vi.mocked(addSentenceCard).mockRejectedValue(new Error("down"));
    await add();
    expect(useStore.getState().sentenceCards[key]).toBe("error");
  });
});
