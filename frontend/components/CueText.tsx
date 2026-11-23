"use client";
import WordToken from "@/components/WordToken";
import { sentenceAt } from "@/lib/words";
import type { HighlightMode } from "@/types";

/** One subtitle line as clickable word tokens; used by the transcript and the overlay on the player. */
export default function CueText({
  index,
  text,
  highlightMode,
  onWordClick,
  className = "",
}: {
  index: number;
  text: string;
  highlightMode: HighlightMode;
  onWordClick: () => void;
  className?: string;
}) {
  const tokens = text.split(/(\s+)/);
  return (
    // the click bubbles up from a word's own handler, so the word is already selected here
    <p className={`font-reading ${className}`} onClick={onWordClick}>
      {tokens.map((token, ti) =>
        /^\s+$/.test(token) ? (
          <span key={ti}>{token}</span>
        ) : (
          <WordToken
            key={ti}
            id={`${index}:${ti}`}
            word={token}
            highlightMode={highlightMode}
            sentence={() => sentenceAt(tokens, ti)}
          />
        ),
      )}
    </p>
  );
}
