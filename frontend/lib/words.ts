// Letters only; inner hyphens/apostrophes survive, edge ones are trimmed. Digits are dropped (no lookups for numbers).
export const cleanWord = (word: string) =>
  word
    .replace(/’/g, "'")
    .replace(/[^\p{L}\p{M}'-]/gu, "")
    .replace(/^['-]+|['-]+$/g, "");
