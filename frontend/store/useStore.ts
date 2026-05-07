
import { create } from "zustand";
import { StoreState } from "@/types";
import { lookupWord, WordLookupResponse } from "@/lib/api";

const USER_ID = 1; // replace with your actual user id

const useStore = create<StoreState>((set) => ({
  text: "",
  setText: (t) => set({ text: t }),
  selectedWord: null,
  setSelectedWord: async (w) => {
    if (!w) {
      set({ selectedWord: null, sidePanelOpen: false, wordResult: null, wordError: null });
      return;
    }
    set({ selectedWord: w, sidePanelOpen: true, wordResult: null, wordError: null, wordLoading: true });
    try {
      const data = await lookupWord(w, USER_ID);
      set({ wordResult: data, wordLoading: false });
    } catch (err: any) {
      set({ wordError: err.message, wordLoading: false });
    }
  },
  wordResult: null,
  wordLoading: false,
  wordError: null,
  highlightMode: "underline",
  setHighlightMode: (m) => set({ highlightMode: m }),
  sidePanelOpen: false,
  setSidePanelOpen: (open) => set({ sidePanelOpen: open }),
}));

export default useStore;
