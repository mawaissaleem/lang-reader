import { WordMeaning } from "@/types";

// Known words the user has "learned" - these get highlighted
export const KNOWN_WORDS = new Set([
  "ich", "du", "er", "sie", "es", "wir", "ihr",
  "bin", "bist", "ist", "sind", "seid",
  "haben", "hat", "habe", "hatte",
  "und", "oder", "aber", "weil", "dass",
  "in", "an", "auf", "mit", "von", "zu", "aus", "bei", "nach",
  "der", "die", "das", "ein", "eine", "einen", "einem", "einer",
  "nicht", "kein", "keine",
  "ja", "nein", "auch", "noch", "schon", "sehr",
  "gut", "schlecht", "groß", "klein", "neu", "alt",
  "heute", "morgen", "gestern", "jetzt", "dann",
  "gehen", "gehe", "geht", "kommen", "kommt", "komme",
  "machen", "macht", "mache", "sehen", "sehe", "sieht",
  "haus", "hause", "wasser", "buch", "bücher",
  "mann", "frau", "kind", "kinder",
  "Deutschland", "Berlin", "Sprache",
  "liebe", "leben", "welt", "zeit", "mensch", "menschen",
  "wie", "was", "wer", "wo", "wann", "warum",
  "alle", "viele", "mehr", "wenig",
]);

// Dummy dictionary — shown in side panel on word click
export const WORD_MEANINGS: Record<string, WordMeaning> = {
  ich: {
    word: "ich",
    translation: "I",
    partOfSpeech: "pronoun",
    examples: [
      { de: "Ich bin müde.", en: "I am tired." },
      { de: "Ich lerne Deutsch.", en: "I am learning German." },
    ],
  },
  du: {
    word: "du",
    translation: "you (informal)",
    partOfSpeech: "pronoun",
    examples: [{ de: "Wie geht es dir?", en: "How are you?" }],
  },
  haus: {
    word: "Haus",
    translation: "house / home",
    partOfSpeech: "noun",
    gender: "das",
    examples: [
      { de: "Das Haus ist groß.", en: "The house is big." },
      { de: "Ich gehe nach Hause.", en: "I am going home." },
    ],
  },
  gut: {
    word: "gut",
    translation: "good / well",
    partOfSpeech: "adjective / adverb",
    examples: [
      { de: "Es geht mir gut.", en: "I am doing well." },
      { de: "Das ist ein gutes Buch.", en: "That is a good book." },
    ],
  },
  gehen: {
    word: "gehen",
    translation: "to go / to walk",
    partOfSpeech: "verb",
    examples: [
      { de: "Ich gehe zur Schule.", en: "I go to school." },
      { de: "Wir gehen spazieren.", en: "We are going for a walk." },
    ],
  },
  liebe: {
    word: "Liebe",
    translation: "love",
    partOfSpeech: "noun",
    gender: "die",
    examples: [
      { de: "Die Liebe ist stark.", en: "Love is strong." },
    ],
  },
  welt: {
    word: "Welt",
    translation: "world",
    partOfSpeech: "noun",
    gender: "die",
    examples: [
      { de: "Die Welt ist schön.", en: "The world is beautiful." },
    ],
  },
  leben: {
    word: "Leben",
    translation: "life / to live",
    partOfSpeech: "noun / verb",
    gender: "das",
    examples: [
      { de: "Das Leben ist kurz.", en: "Life is short." },
      { de: "Ich lebe in Berlin.", en: "I live in Berlin." },
    ],
  },
};

export function getWordMeaning(word: string): WordMeaning | null {
  const key = word.toLowerCase().replace(/[.,!?;:"'()]/g, "");
  return WORD_MEANINGS[key] ?? null;
}

export function isKnownWord(word: string): boolean {
  const clean = word.toLowerCase().replace(/[.,!?;:"'()]/g, "");
  return KNOWN_WORDS.has(clean) || KNOWN_WORDS.has(word);
}
