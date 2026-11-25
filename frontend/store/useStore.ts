import { create } from "zustand";
import {
  aiKey,
  sentenceKey,
  AiEntry,
  SentenceCardState,
  StoreState,
  WordStatus,
} from "@/types";
import { clickedKey } from "@/lib/words";
import {
  applyTheme,
  DEFAULT_DISPLAY,
  loadDisplay,
  saveDisplay,
} from "@/lib/display";
import {
  lookupWord,
  fetchSentenceTranslation,
  fetchAiAnswer,
  addSentenceCard,
  saveWord,
  fetchUserWords,
  patchWordStatus,
  fetchTranslators,
  type WordLookupResponse,
} from "@/lib/api";

// open on the preferred source when it has a result, else on whatever was returned
const openTab = (d: WordLookupResponse) =>
  d.translations[d.preferred] ? d.preferred : d.source;

const useStore = create<StoreState>((set, get) => ({
  text: "",
  title: "",
  textRef: null,
  setText: (text, title, ref) =>
    set({ text: text, title: title, textRef: ref ?? null }),
  selectedWord: null,
  selectedSentence: null,
  sentenceTranslation: null,
  sentenceLoading: false,
  sentenceError: false,
  selectedTextRef: null,
  selectedTokens: [],
  // Shift+click: add the token to the selection when it shares the sentence, else start over with it
  extendSelection: (token, sentence) => {
    const { selectedTokens, selectedSentence, setSelectedWord } = get();
    const para = (t: { id: string }) => t.id.split(":")[0];
    if (
      !selectedTokens.length ||
      selectedSentence !== sentence ||
      para(selectedTokens[0]) !== para(token)
    ) {
      return setSelectedWord(token.word, sentence, [token]);
    }
    if (selectedTokens.some((t) => t.id === token.id)) return;
    const tokens = [...selectedTokens, token].sort(
      (a, b) => Number(a.id.split(":")[1]) - Number(b.id.split(":")[1]),
    );
    return setSelectedWord(
      tokens.map((t) => t.word).join(" "),
      sentence,
      tokens,
    );
  },
  setSelectedWord: async (w, sentence, tokens = [], findParticle) => {
    if (!w) {
      set({
        selectedTokens: [],
        selectedWord: null,
        selectedSentence: null,
        sentenceTranslation: null,
        sentenceLoading: false,
        sentenceError: false,
        selectedTextRef: null,
        sidePanelOpen: false,
        wordResult: null,
        wordError: null,
        wordSaved: false,
        saveError: null,
      });
      return;
    }
    const { translatorPriority } = get();
    // a shift+click extension keeps the sentence, so keep its translation too (retry only after an error)
    const sameSentence =
      !!sentence && sentence === get().selectedSentence && !get().sentenceError;
    if (sentence && !sameSentence) {
      set({
        sentenceTranslation: null,
        sentenceError: false,
        sentenceLoading: true,
      });
      // not awaited: the word lookup must not wait for it
      fetchSentenceTranslation(sentence).then(
        (tr) =>
          get().selectedSentence === sentence &&
          set({
            sentenceTranslation: tr,
            sentenceError: false,
            sentenceLoading: false,
          }),
        // an earlier request for this sentence may already have shown its translation
        () =>
          get().selectedSentence === sentence &&
          !get().sentenceTranslation &&
          set({ sentenceError: true, sentenceLoading: false }),
      );
    } else if (!sentence)
      set({
        sentenceTranslation: null,
        sentenceError: false,
        sentenceLoading: false,
      });
    set({
      selectedTokens: tokens,
      selectedWord: w,
      selectedSentence: sentence ?? null,
      selectedTextRef: get().textRef,
      // the video reader keeps the panel closed until "Details" is pressed
      sidePanelOpen: get().openPanelOnSelect || get().sidePanelOpen,
      wordResult: null,
      wordError: null,
      wordLoading: true,
      wordSaved: false,
      saveError: null,
      sourceLoading: false,
      sourceError: null,
    });
    try {
      const data = await lookupWord(w, translatorPriority, false, sentence);
      // a newer click owns the panel and the loading flag
      if (get().selectedWord !== w) return;
      set({
        wordResult: data,
        activeSource: openTab(data),
        sourceError: null,
        wordLoading: false,
      });
      // a lone verb with a separated particle: select both, which looks up the merged verb.
      // Skip it when a newer click selected other tokens, even for the same word text.
      const stillSelected = get().selectedTokens === tokens;
      if (!data.particle || tokens.length !== 1 || !sentence || !stillSelected)
        return;
      const particle = findParticle?.(data.particle, data.particle_skip ?? 0);
      if (particle) await get().extendSelection(particle, sentence);
    } catch (err) {
      if (get().selectedWord !== w) return;
      set({
        wordError: err instanceof Error ? err.message : String(err),
        wordLoading: false,
      });
    }
  },
  wordResult: null,
  wordLoading: false,
  wordError: null,
  wordSaved: false,
  wordSaving: false,
  saveError: null,
  activeSource: null,
  // switching tabs re-enables Save so the word can be re-saved from the other source
  setActiveSource: (source) =>
    set({
      activeSource: source,
      wordSaved: false,
      saveError: null,
      sourceError: null,
    }),
  sourceLoading: false,
  sourceError: null,
  lookupSource: async (source) => {
    const { selectedWord, selectedSentence } = get();
    if (!selectedWord) return;
    set({ sourceLoading: true, sourceError: null });
    try {
      // not force: the backend fetches only the missing source
      const data = await lookupWord(
        selectedWord,
        source,
        false,
        selectedSentence,
      );
      // the user picked another word meanwhile: setSelectedWord already reset the source state
      if (
        get().selectedWord !== selectedWord ||
        get().wordResult?.id !== data.id
      )
        return;
      set((state) => ({
        sourceLoading: false,
        sourceError: data.translations[source]
          ? null
          : (data.errors?.[source] ?? `No result from ${source}`),
        wordResult: state.wordResult && {
          ...state.wordResult,
          translations: {
            ...state.wordResult.translations,
            ...data.translations,
          },
        },
      }));
    } catch (err) {
      if (get().selectedWord !== selectedWord) return;
      set({
        sourceLoading: false,
        sourceError: err instanceof Error ? err.message : String(err),
      });
    }
  },
  ai: {},
  askAi: async () => {
    const { selectedWord, selectedSentence } = get();
    if (!selectedWord || !selectedSentence) return;
    const key = aiKey(selectedWord, selectedSentence);
    if (get().ai[key]?.status === "loading" || get().ai[key]?.status === "done")
      return;
    // keyed writes: a late answer lands on its own word and never on the panel's current one
    const put = (e: AiEntry) => set((st) => ({ ai: { ...st.ai, [key]: e } }));
    const count = (n: number) =>
      set((st) => {
        const cur = st.ai[key];
        return cur?.status === "loading"
          ? {
              ai: {
                ...st.ai,
                [key]: { ...cur, tokens: n ? cur.tokens + n : 0 },
              },
            }
          : st;
      });
    put({ status: "loading", startedAt: Date.now(), tokens: 0 });
    try {
      put({
        status: "done",
        answer: await fetchAiAnswer(selectedWord, selectedSentence, {
          onToken: () => count(1),
          onRetry: () => count(0),
        }),
      });
    } catch (err) {
      put({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
  sentenceCards: {},
  addSentenceCard: async (german, english, word, source, bold = []) => {
    const key = sentenceKey(word, german);
    const put = (state: SentenceCardState) =>
      set((st) => ({ sentenceCards: { ...st.sentenceCards, [key]: state } }));
    put("adding");
    try {
      put(
        (
          await addSentenceCard({
            sentence_de: german,
            sentence_en: english,
            target_word: word,
            source,
            bold,
          })
        ).anki_status,
      );
    } catch {
      put("error");
    }
  },
  saveSelectedWord: async (anki = false) => {
    const { wordResult, activeSource, selectedSentence, selectedTextRef } =
      get();
    if (!wordResult?.id) return;
    set({ wordSaving: true, saveError: null });
    const context = {
      form: clickedKey(wordResult),
      ...(selectedSentence && {
        context_sentence: selectedSentence,
        text_kind: selectedTextRef?.kind,
        text_id: selectedTextRef?.id,
      }),
    };
    try {
      const saved = await saveWord(
        wordResult.id,
        activeSource && activeSource !== "ai" ? activeSource : undefined,
        context,
        anki,
      );
      // already_saved or not, reload to get the user_words id and status
      await get().loadUserWords();
      // shortcut: only the clicked form gets the base form's color; other inflected forms of the same word keep their own, separate color
      const base = get().userWords[wordResult.word];
      if (base)
        set((st) => ({
          userWords: { ...st.userWords, [clickedKey(wordResult)]: base },
        }));
      // a newer click may own the panel by now
      set({
        wordSaving: false,
        ...(get().wordResult?.id === wordResult.id && { wordSaved: true }),
        ...(saved.anki_status === "failed" && {
          saveError: "Saved, but Anki rejected the note (maybe a duplicate)",
        }),
      });
    } catch (err) {
      set({
        wordSaving: false,
        saveError: err instanceof Error ? err.message : String(err),
      });
    }
  },
  ...DEFAULT_DISPLAY, // always the defaults at first render; saved values load after mount
  setDisplay: (patch) => {
    set(patch);
    applyTheme(get().theme);
    saveDisplay(get());
  },
  loadDisplay: () => {
    const saved = loadDisplay();
    set(saved);
    applyTheme(saved.theme);
  },
  openPanelOnSelect: true,
  setOpenPanelOnSelect: (open) => set({ openPanelOnSelect: open }),
  sidePanelOpen: false,
  setSidePanelOpen: (open) => set({ sidePanelOpen: open }),
  userWords: {},
  loadUserWords: async () => {
    const words = await fetchUserWords();
    set({
      // clicked forms first, so a saved word with the same text as another word's form keeps its own entry
      userWords: Object.fromEntries(
        words
          .flatMap((w) =>
            (w.forms ?? []).map((f) => [f, { id: w.id, status: w.status }]),
          )
          .concat(words.map((w) => [w.word, { id: w.id, status: w.status }])),
      ),
    });
  },
  setWordStatus: async (status) => {
    const { wordResult } = get();
    if (!wordResult) return; // lookup not loaded yet
    // saved words are keyed by base form
    const key = wordResult.word;
    // not saved yet: save first (needs the loaded lookup), which also gives us the id
    if (!get().userWords[key]) {
      await get().saveSelectedWord();
    }
    const prev = get().userWords[key];
    if (!prev) return; // save failed; saveError is already set
    // the clicked form (ging) shares the base form's (gehen) entry so the word on the page recolors
    const setStatus = (s: WordStatus) =>
      set((st) => {
        const entry = { id: prev.id, status: s };
        return {
          userWords: {
            ...st.userWords,
            [key]: entry,
            [clickedKey(wordResult)]: entry,
          },
        };
      });
    setStatus(status);
    try {
      await patchWordStatus(prev.id, status, clickedKey(wordResult));
    } catch (err) {
      setStatus(prev.status);
      set({ saveError: err instanceof Error ? err.message : String(err) });
    }
  },
  translators: [],
  loadTranslators: async () => {
    try {
      const translators = await fetchTranslators();
      // a saved id the backend no longer offers falls back to the first listed
      const { translatorPriority } = get();
      const known = translators.some((t) => t.id === translatorPriority);
      // an empty list keeps the current id rather than throwing
      const fallback = translators[0]?.id ?? translatorPriority;
      set({
        translators,
        translatorPriority: known ? translatorPriority : fallback,
      });
    } catch {
      // the list stays empty; the UI shows raw ids
    }
  },
  translatorPriority: "pons", // "pons" at first render; saved value loads after mount
  loadTranslatorPriority: () => {
    try {
      const saved = localStorage.getItem("translatorPriority");
      if (!saved) return;
      // once the list is known, only an id from it is accepted
      const { translators } = get();
      if (translators.length && !translators.some((t) => t.id === saved))
        return;
      set({ translatorPriority: saved });
    } catch {}
  },
  setTranslatorPriority: async (priority) => {
    try {
      localStorage.setItem("translatorPriority", priority);
    } catch {}
    set({ translatorPriority: priority });
    // Re-lookup without force: the backend serves cached sources and only fetches what is missing
    const { selectedWord, selectedSentence } = get();
    if (selectedWord) {
      set({
        wordResult: null,
        wordError: null,
        wordLoading: true,
        wordSaved: false,
        saveError: null,
        sourceLoading: false,
        sourceError: null,
      });
      try {
        const data = await lookupWord(
          selectedWord,
          priority,
          false,
          selectedSentence,
        );
        if (get().selectedWord !== selectedWord) return;
        set({
          wordResult: data,
          activeSource: openTab(data),
          sourceError: null,
          wordLoading: false,
        });
      } catch (err) {
        if (get().selectedWord !== selectedWord) return;
        set({
          wordError: err instanceof Error ? err.message : String(err),
          wordLoading: false,
        });
      }
    }
  },
}));

export default useStore;
