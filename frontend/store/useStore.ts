import { create } from "zustand";
import { StoreState } from "@/types";
import { lookupWord, saveWord, fetchUserWords, type WordLookupResponse } from "@/lib/api";

const USER_ID = 1;

// open on the preferred source when it has a result, else on whatever was returned
const openTab = (d: WordLookupResponse) => (d.translations[d.preferred] ? d.preferred : d.source);

const useStore = create<StoreState>((set, get) => ({
  text: "",
  title: "",
  setText: (text: string, title:string | undefined) => set({ text: text, title: title }),
  selectedWord: null,
  setSelectedWord: async (w) => {
    if (!w) {
      set({ selectedWord: null, sidePanelOpen: false, wordResult: null, wordError: null, wordSaved: false, saveError: null });
      return;
    }
    const { translatorPriority } = get();
    set({ selectedWord: w, sidePanelOpen: true, wordResult: null, wordError: null, wordLoading: true, wordSaved: false, saveError: null, sourceLoading: false, sourceError: null });
    try {
      const data = await lookupWord(w, USER_ID, translatorPriority);
      // a newer click owns the panel and the loading flag
      if (get().selectedWord !== w) return;
      set({ wordResult: data, activeSource: openTab(data), sourceError: null, wordLoading: false });
    } catch (err) {
      if (get().selectedWord !== w) return;
      set({ wordError: err instanceof Error ? err.message : String(err), wordLoading: false });
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
  setActiveSource: (source) => set({ activeSource: source, wordSaved: false, saveError: null, sourceError: null }),
  sourceLoading: false,
  sourceError: null,
  lookupSource: async (source) => {
    const { selectedWord } = get();
    if (!selectedWord) return;
    set({ sourceLoading: true, sourceError: null });
    try {
      // not force: the backend fetches only the missing source
      const data = await lookupWord(selectedWord, USER_ID, source);
      // the user picked another word meanwhile: setSelectedWord already reset the source state
      if (get().selectedWord !== selectedWord || get().wordResult?.id !== data.id) return;
      set((state) => ({
        sourceLoading: false,
        sourceError: data.translations[source] ? null : data.errors?.[source] ?? `No result from ${source}`,
        wordResult: state.wordResult && { ...state.wordResult, translations: { ...state.wordResult.translations, ...data.translations } },
      }));
    } catch (err) {
      if (get().selectedWord !== selectedWord) return;
      set({ sourceLoading: false, sourceError: err instanceof Error ? err.message : String(err) });
    }
  },
  saveSelectedWord: async () => {
    const { wordResult, activeSource } = get();
    if (!wordResult?.id) return;
    set({ wordSaving: true, saveError: null });
    try {
      await saveWord(wordResult.id, USER_ID, activeSource ?? undefined);
      // already_saved or not, the word is now known
      set((state) => ({
        wordSaved: true,
        wordSaving: false,
        knownWords: new Set([...state.knownWords, wordResult.word.toLowerCase()]),
      }));
    } catch (err) {
      set({ wordSaving: false, saveError: err instanceof Error ? err.message : String(err) });
    }
  },
  highlightMode: "underline",
  setHighlightMode: (m) => set({ highlightMode: m }),
  sidePanelOpen: false,
  setSidePanelOpen: (open) => set({ sidePanelOpen: open }),
  knownWords: new Set<string>(),
  loadUserWords: async (userId: number) => {
    const words = await fetchUserWords(userId);
    set({ knownWords: new Set(words.map((w) => w.word.toLowerCase())) });
  },
  translatorPriority: "pons", // always "pons" at first render; saved value loads after mount
  loadTranslatorPriority: () => {
    try {
      const saved = localStorage.getItem("translatorPriority");
      if (saved === "pons" || saved === "libretranslate") set({ translatorPriority: saved });
    } catch {}
  },
  setTranslatorPriority: async (priority) => {
    try {
      localStorage.setItem("translatorPriority", priority);
    } catch {}
    set({ translatorPriority: priority });
    // Re-lookup without force: the backend serves cached sources and only fetches what is missing
    const { selectedWord } = get();
    if (selectedWord) {
      set({ wordResult: null, wordError: null, wordLoading: true, wordSaved: false, saveError: null, sourceLoading: false, sourceError: null });
      try {
        const data = await lookupWord(selectedWord, USER_ID, priority);
        if (get().selectedWord !== selectedWord) return;
        set({ wordResult: data, activeSource: openTab(data), sourceError: null, wordLoading: false });
      } catch (err) {
        if (get().selectedWord !== selectedWord) return;
        set({ wordError: err instanceof Error ? err.message : String(err), wordLoading: false });
      }
    }
  },
}));

export default useStore;
