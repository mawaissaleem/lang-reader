export type HighlightMode = "underline" | "highlight";
export type WordStatus = "learning1" | "learning2" | "learning3" | "known" | "ignored";

import type { WordLookupResponse } from "@/lib/api";

// which library entry the reader is showing (kind = LibraryEntry.type, id = LibraryEntry.id)
export interface TextRef { kind: "video" | "text"; id: number }

export interface SelectedToken {
  id: string;
  word: string;
}

export interface StoreState {
  text: string;
  title: string;
  textRef: TextRef | null;
  setText: (text: string, title: string | undefined, ref?: TextRef) => void;
  selectedWord: string | null;
  selectedSentence: string | null;
  sentenceTranslation: string | null; // English for selectedSentence; fetched in parallel with the word
  sentenceLoading: boolean;
  sentenceError: boolean;
  selectedTextRef: TextRef | null; // textRef at click time, so a later setText can't mislabel the save
  // a selected token: id "paragraph:index" plus its cleaned word; two or more are looked up as one phrase
  selectedTokens: SelectedToken[];
  setSelectedWord: (w: string | null, sentence?: string, tokens?: SelectedToken[]) => void;
  extendSelection: (token: SelectedToken, sentence: string) => void;
  wordResult: WordLookupResponse | null;
  wordLoading: boolean;
  wordError: string | null;
  wordSaved: boolean;
  wordSaving: boolean;
  saveError: string | null;
  activeSource: string | null;
  setActiveSource: (source: string) => void;
  sourceLoading: boolean;
  sourceError: string | null;
  lookupSource: (source: string) => Promise<void>;
  saveSelectedWord: (anki?: boolean) => Promise<void>;
  highlightMode: HighlightMode;
  setHighlightMode: (m: HighlightMode) => void;
  sidePanelOpen: boolean;
  setSidePanelOpen: (open: boolean) => void;
  // saved words by lowercase text; id is user_words.id (what the status endpoint takes)
  userWords: Record<string, { id: number; status: WordStatus }>;
  setWordStatus: (status: WordStatus) => Promise<void>;
  loadUserWords: (userId: number) => Promise<void>;
  translatorPriority: "pons" | "libretranslate";
  loadTranslatorPriority: () => void;
  setTranslatorPriority: (priority: "pons" | "libretranslate") => void;
}
