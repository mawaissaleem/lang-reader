// Letters only; inner hyphens/apostrophes survive, edge ones are trimmed. Digits are dropped (no lookups for numbers).
// Sentence containing tokens[index] (tokens from text.split(/(\s+)/), one paragraph), split on . ! ?
// shortcut: abbreviations like "z.B." split early; upgrade if real texts need it
export function sentenceAt(tokens: string[], index: number): string {
  const ends = (t: string) => /[.!?]["'“”„‘’»«)\]]*$/.test(t);
  let start = index;
  while (start > 0 && !ends(tokens[start - 1].trim() || "-")) start--;
  let end = index;
  while (end < tokens.length - 1 && !ends(tokens[end])) end++;
  return tokens
    .slice(start, end + 1)
    .join("")
    .trim();
}

// Key rule: a word is stored as the backend returns it (nouns capitalized, all else lowercase).
// A token looks up its exact form first, then lowercase, so old lowercase saves still color.
// shortcut: a sentence-initial "Essen" (verb) colors as the verb entry if only that one is saved; upgrade if homographs matter
export const entryFor = <T>(
  map: Record<string, T>,
  word: string,
): T | undefined => map[word] ?? map[word.toLowerCase()];

// Key for the clicked inflection (Tische -> Tisch, ging -> gehen) so it shares the base form's entry.
export const clickedKey = (r: { word: string; clicked: string }) =>
  r.word === r.word.toLowerCase() ? r.clicked.toLowerCase() : r.clicked;

export const cleanWord = (word: string) =>
  word
    .replace(/’/g, "'")
    .replace(/[^\p{L}\p{M}'-]/gu, "")
    .replace(/^['-]+|['-]+$/g, "");
