import { cleanWord, entryFor } from "@/lib/words";

const MIN_WORDS = 250; // a page is closed once it has this many words
const MAX_WORDS = 350; // a paragraph that would push a page past this starts the next page

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Greedily groups `parts` into pages of roughly MIN..MAX words, never splitting a part. */
function group(parts: string[], joiner: string): string[] {
  const pages: string[] = [];
  let current: string[] = [];
  let count = 0;
  const flush = () => {
    if (current.length) pages.push(current.join(joiner));
    current = [];
    count = 0;
  };
  for (const part of parts) {
    const n = wordCount(part);
    if (count > 0 && count + n > MAX_WORDS) flush();
    current.push(part);
    count += n;
    if (count >= MIN_WORDS) flush();
  }
  flush();
  return pages;
}

/** Splits a text into pages on paragraph boundaries; a single huge paragraph is split on sentences instead. */
export function splitPages(text: string): string[] {
  const paragraphs = text.split(/\n+/).filter(Boolean);
  const parts = paragraphs.flatMap((p) =>
    wordCount(p) > MAX_WORDS ? bigParagraph(p) : [p],
  );
  return group(parts, "\n");
}

// A huge paragraph becomes sentence-grouped chunks, each handed on as its own paragraph.
// shortcut: a single sentence longer than a page stays whole, upgrade if such texts show up
function bigParagraph(p: string): string[] {
  return group(p.split(/(?<=[.!?])\s+/), " ");
}

/** The unique cleaned words of `text` that the user has not saved yet (not even as ignored). */
export function newForms(
  text: string,
  userWords: Record<string, unknown>,
): string[] {
  const forms = new Set(text.split(/\s+/).map(cleanWord).filter(Boolean));
  return [...forms].filter((w) => entryFor(userWords, w) === undefined);
}
