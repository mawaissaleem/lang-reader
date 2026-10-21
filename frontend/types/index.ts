export type HighlightMode = "underline" | "highlight";

import { WordLookupResponse } from "@/lib/api";

export interface StoreState {
  text: string;
  title: string;
  setText: (text: string, title:string | undefined) => void;
  selectedWord: string | null;
  setSelectedWord: (w: string | null) => void;
  wordResult: WordLookupResponse | null;
  wordLoading: boolean;
  wordError: string | null;
  wordSaved: boolean;
  wordSaving: boolean;
  saveError: string | null;
  saveSelectedWord: () => Promise<void>;
  highlightMode: HighlightMode;
  setHighlightMode: (m: HighlightMode) => void;
  sidePanelOpen: boolean;
  setSidePanelOpen: (open: boolean) => void;
  knownWords: Set<string>;
  loadUserWords: (userId: number) => Promise<void>;
  translatorPriority: "pons" | "libretranslate";
  loadTranslatorPriority: () => void;
  setTranslatorPriority: (priority: "pons" | "libretranslate") => void;
}
