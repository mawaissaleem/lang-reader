import { create } from "zustand";
import { StoreState } from "@/types";

const useStore = create<StoreState>((set) => ({
  text: "",
  setText: (t) => set({ text: t }),

  selectedWord: null,
  setSelectedWord: (w) => set({ selectedWord: w, sidePanelOpen: w !== null }),

  highlightMode: "underline",
  setHighlightMode: (m) => set({ highlightMode: m }),

  sidePanelOpen: false,
  setSidePanelOpen: (open) => set({ sidePanelOpen: open }),
}));

export default useStore;
