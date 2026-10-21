import { create } from "zustand";
import { StoreState } from "@/types";
import { lookupWord, saveWord, fetchUserWords } from "@/lib/api";

const USER_ID = 1;

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
    set({ selectedWord: w, sidePanelOpen: true, wordResult: null, wordError: null, wordLoading: true, wordSaved: false, saveError: null });
    try {
      const data = await lookupWord(w, USER_ID, translatorPriority);
      set({ wordResult: data, wordLoading: false });
    } catch (err) {
      set({ wordError: err instanceof Error ? err.message : String(err), wordLoading: false });
    }
  },
  wordResult: null,
  wordLoading: false,
  wordError: null,
  wordSaved: false,
  wordSaving: false,
  saveError: null,
  saveSelectedWord: async () => {
    const { wordResult } = get();
    if (!wordResult?.id) return;
    set({ wordSaving: true, saveError: null });
    try {
      await saveWord(wordResult.id, USER_ID);
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
    // Re-lookup current word with the new priority (force=true to bypass cache)
    const { selectedWord } = get();
    if (selectedWord) {
      set({ wordResult: null, wordError: null, wordLoading: true, wordSaved: false, saveError: null });
      try {
        const data = await lookupWord(selectedWord, USER_ID, priority, true);
        set({ wordResult: data, wordLoading: false });
      } catch (err) {
        set({ wordError: err instanceof Error ? err.message : String(err), wordLoading: false });
      }
    }
  },
}));

export default useStore;
