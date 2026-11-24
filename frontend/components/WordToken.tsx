"use client";
import useStore from "@/store/useStore";
import { HighlightMode } from "@/types";
import clsx from "clsx";
import { cleanWord, entryFor } from "@/lib/words";
import { NEW_CLASS, STATUS_CLASS } from "@/lib/status";

interface Props {
  word: string;
  highlightMode: HighlightMode;
  sentence: () => string;
  id?: string; // "paragraph:index", needed for Shift+click multi-word selection
}

export default function WordToken({
  word,
  highlightMode,
  sentence,
  id,
}: Props) {
  const clean = cleanWord(word);
  const setSelectedWord = useStore((s) => s.setSelectedWord);
  const status = useStore((s) => entryFor(s.userWords, clean)?.status);
  // same rule as entryFor: a lowercase selection (das) also marks "Das"; a noun (Bank) never marks "bank"
  const isSelected = useStore((s) =>
    s.selectedTokens.length > 1
      ? s.selectedTokens.some((t) => t.id === id)
      : s.selectedWord === clean ||
        (s.selectedWord === s.selectedWord?.toLowerCase() &&
          s.selectedWord === clean.toLowerCase()),
  );
  const extendSelection = useStore((s) => s.extendSelection);
  const highlightsOn = useStore((s) => s.highlightsOn);

  if (!clean) {
    return <span className="text-faint">{word}</span>;
  }

  return (
    <span
      onClick={(e) => {
        const token = { id: id ?? "", word: clean };
        if (e.shiftKey && id) extendSelection(token, sentence());
        else setSelectedWord(clean, sentence(), id ? [token] : []);
      }}
      className={clsx(
        "cursor-pointer rounded px-0.5 transition-all duration-150",
        isSelected &&
          "ring-2 ring-accent ring-offset-1 ring-offset-surface rounded",
        // Highlights off: plain text, so the page reads like a book
        highlightsOn &&
          (status ? STATUS_CLASS[status][highlightMode] : NEW_CLASS),
        "hover:opacity-70",
      )}
    >
      {word}
    </span>
  );
}
