"use client";
import useStore from "@/store/useStore";
import { HighlightMode, SelectedToken } from "@/types";
import clsx from "clsx";
import { cleanWord, entryFor, inSelectionRange } from "@/lib/words";
import { NEW_CLASS, STATUS_CLASS } from "@/lib/status";

interface Props {
  word: string;
  highlightMode: HighlightMode;
  sentence: () => string;
  id?: string; // "paragraph:index", needed for Shift+click multi-word selection
  // locates a verb's separated particle in this sentence, passing over `skip` earlier words with its text
  findParticle?: (particle: string, skip: number) => SelectedToken | null;
}

// the dotted line that joins the parts of a multi-word selection (fängt ... an)
const LINK_CLASS =
  "underline decoration-dotted decoration-2 underline-offset-4 decoration-accent";

/** The whitespace between two word tokens; underlined inside a selection so the joining line has no gaps. */
export function WordGap({ id, text }: { id: string; text: string }) {
  const isLinked = useStore((s) => inSelectionRange(s.selectedTokens, id));
  return <span className={isLinked ? LINK_CLASS : undefined}>{text}</span>;
}

export default function WordToken({
  word,
  highlightMode,
  sentence,
  id,
  findParticle,
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
  // words between the two parts of a separable verb get the dotted line that joins them
  const isLinked = useStore(
    (s) => !!id && inSelectionRange(s.selectedTokens, id),
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
        else
          setSelectedWord(clean, sentence(), id ? [token] : [], findParticle);
      }}
      className={clsx(
        "cursor-pointer rounded px-0.5 transition-all duration-150",
        isSelected &&
          "ring-2 ring-accent ring-offset-1 ring-offset-surface rounded",
        isLinked && LINK_CLASS,
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
