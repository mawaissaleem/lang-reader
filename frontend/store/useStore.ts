import { create } from "zustand";
import { StoreState } from "@/types";
import { lookupWord, saveWord, fetchUserWords, WordLookupResponse } from "@/lib/api";

const USER_ID = 1;

const useStore = create<StoreState>((set, get) => ({
  text: "",
  title: "",
  setText: (text: string, title:string | undefined) => set({ text: text, title: title }),
  selectedWord: null,
  setSelectedWord: async (w) => {
    if (!w) {
      set({ selectedWord: null, sidePanelOpen: false, wordResult: null, wordError: null, wordSaved: false });
      return;
    }
    const { translatorPriority } = get();
    set({ selectedWord: w, sidePanelOpen: true, wordResult: null, wordError: null, wordLoading: true, wordSaved: false });
    try {
      const data = await lookupWord(w, USER_ID, translatorPriority);
      set({ wordResult: data, wordLoading: false });
    } catch (err: any) {
      set({ wordError: err.message, wordLoading: false });
    }
  },
  wordResult: null,
  wordLoading: false,
  wordError: null,
  wordSaved: false,
  wordSaving: false,
  saveSelectedWord: async () => {
    const { wordResult } = get();
    if (!wordResult?.id) return;
    set({ wordSaving: true });
    try {
      const res = await saveWord(wordResult.id, USER_ID);
      if (res.already_saved || !res.already_saved) {
        // either way, mark as saved and add to knownWords
        set((state) => ({
          wordSaved: true,
          wordSaving: false,
          knownWords: new Set([...state.knownWords, wordResult.word.toLowerCase()]),
        }));
      }
    } catch (err: any) {
      set({ wordSaving: false });
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
  translatorPriority: (typeof window !== "undefined"
    ? (localStorage.getItem("translatorPriority") as "pons" | "libretranslate") ?? "pons"
    : "pons"),
  setTranslatorPriority: async (priority) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("translatorPriority", priority);
    }
    set({ translatorPriority: priority });
    // Re-lookup current word with the new priority (force=true to bypass cache)
    const { selectedWord } = get();
    if (selectedWord) {
      set({ wordResult: null, wordError: null, wordLoading: true, wordSaved: false });
      try {
        const data = await lookupWord(selectedWord, USER_ID, priority, true);
        set({ wordResult: data, wordLoading: false });
      } catch (err: any) {
        set({ wordError: err.message, wordLoading: false });
      }
    }
  },
}));

export default useStore;
