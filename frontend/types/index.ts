export type HighlightMode = "underline" | "highlight";
export type ReaderTheme = "dark" | "paper";
export type TextSize = "S" | "M" | "L";
export interface DisplaySettings {
  theme: ReaderTheme;
  textSize: TextSize;
  highlightsOn: boolean;
  focusMode: boolean;
  genderColours: boolean;
  highlightMode: HighlightMode;
}
export type WordStatus =
  "learning1" | "learning2" | "learning3" | "known" | "ignored";

import type { AiAnswer, WordLookupResponse } from "@/lib/api";

// which library entry the reader is showing (kind = LibraryEntry.type, id = LibraryEntry.id)
export type AiEntry =
  | { status: "loading"; startedAt: number; tokens: number }
  | { status: "done"; answer: AiAnswer }
  | { status: "error"; error: string };

export const aiKey = (word: string, sentence: string) => `${word}\n${sentence}`;

// Anki sentence-card state by target word + sentence; "adding" = request in flight, "error" = request failed
export type SentenceCardState =
  "adding" | "pending" | "sent" | "failed" | "error";
export const sentenceKey = (word: string, sentence: string) =>
  `${word}\n${sentence}`;

export interface TextRef {
  kind: "video" | "text";
  id: number;
}

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
  setSelectedWord: (
    w: string | null,
    sentence?: string,
    tokens?: SelectedToken[],
    findParticle?: (particle: string, skip: number) => SelectedToken | null,
  ) => void;
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
  // AI answers by word + sentence: they outlive tab switches and word changes
  ai: Record<string, AiEntry>;
  askAi: () => Promise<void>;
  sentenceCards: Record<string, SentenceCardState>;
  addSentenceCard: (
    german: string,
    english: string,
    word: string,
    source: string,
    bold?: string[],
  ) => Promise<void>;
  saveSelectedWord: (anki?: boolean) => Promise<void>;
  highlightMode: HighlightMode;
  // reader Display menu; persisted together in localStorage
  theme: ReaderTheme;
  textSize: TextSize;
  highlightsOn: boolean;
  focusMode: boolean;
  genderColours: boolean;
  setDisplay: (patch: Partial<DisplaySettings>) => void;
  loadDisplay: () => void;
  // false in the video reader, where a word opens a compact card instead of the panel
  openPanelOnSelect: boolean;
  setOpenPanelOnSelect: (open: boolean) => void;
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
