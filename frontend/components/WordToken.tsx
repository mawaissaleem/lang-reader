"use client";
import useStore from "@/store/useStore";
import { HighlightMode } from "@/types";
import clsx from "clsx";

interface Props {
  word: string;
  highlightMode: HighlightMode;
}

export default function WordToken({ word, highlightMode }: Props) {
  const { setSelectedWord, selectedWord, knownWords } = useStore();

  const clean = word.replace(/[.,!?;:"'()]/g, "");
  const known = knownWords.has(clean.toLowerCase());
  const isSelected = selectedWord?.toLowerCase() === clean.toLowerCase();

  if (!clean) {
    return <span className="text-gray-400">{word}</span>;
  }

  return (
    <span
      onClick={() => setSelectedWord(clean)}
      className={clsx(
        "cursor-pointer rounded px-0.5 transition-all duration-150",
        isSelected && "ring-2 ring-blue-400 ring-offset-1 rounded",
        known && highlightMode === "underline" &&
          "underline decoration-blue-500 decoration-2 underline-offset-3 text-blue-900",
        known && highlightMode === "highlight" &&
          "bg-blue-100 text-blue-900",
        !known && "text-gray-800 hover:bg-gray-100",
        known && "hover:opacity-80",
      )}
    >
      {word}
    </span>
  );
}
