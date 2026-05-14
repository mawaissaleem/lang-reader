export type HighlightMode = "underline" | "highlight";

export interface WordMeaning {
  word: string;
  translation: string;
  partOfSpeech: string;
  examples: { de: string; en: string }[];
  gender?: string;
}

import { WordLookupResponse } from "@/lib/api";

export interface StoreState {
  text: string;
  setText: (t: string) => void;
  selectedWord: string | null;
  setSelectedWord: (w: string | null) => void;
  wordResult: WordLookupResponse | null;
  wordLoading: boolean;
  wordError: string | null;
  wordSaved: boolean;
  wordSaving: boolean;
  saveSelectedWord: () => Promise<void>;
  highlightMode: HighlightMode;
  setHighlightMode: (m: HighlightMode) => void;
  sidePanelOpen: boolean;
  setSidePanelOpen: (open: boolean) => void;
  knownWords: Set<string>;
  loadUserWords: (userId: number) => Promise<void>;
}
