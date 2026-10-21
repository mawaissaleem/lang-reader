"use client";
import useStore from "@/store/useStore";
import { HighlightMode } from "@/types";
import clsx from "clsx";
import { cleanWord } from "@/lib/words";

interface Props {
  word: string;
  highlightMode: HighlightMode;
}

export default function WordToken({ word, highlightMode }: Props) {
  const clean = cleanWord(word);
  const key = clean.toLowerCase();
  const setSelectedWord = useStore((s) => s.setSelectedWord);
  const known = useStore((s) => s.knownWords.has(key));
  const isSelected = useStore((s) => s.selectedWord?.toLowerCase() === key);

  if (!clean) {
    return <span className="text-white/20">{word}</span>;
  }

  return (
    <span
      onClick={() => setSelectedWord(clean)}
      className={clsx(
        "cursor-pointer rounded px-0.5 transition-all duration-150",
        isSelected && "ring-2 ring-blue-400 ring-offset-1 ring-offset-[#111114] rounded",
        known && highlightMode === "underline" &&
          "underline decoration-blue-400 decoration-2 underline-offset-3 text-blue-300",
        known && highlightMode === "highlight" &&
          "bg-blue-500/20 text-blue-300",
        !known && "text-white/75 hover:bg-white/[0.06]",
        known && "hover:opacity-70",
      )}
    >
      {word}
    </span>
  );
}
