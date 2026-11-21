"use client";

import useStore from "@/store/useStore";
import { sentenceKey } from "@/types";

const LABEL = {
  adding: "Adding…",
  pending: "Waiting for Anki",
  sent: "✓ In Anki",
  failed: "Anki rejected it · retry",
  error: "Failed · retry",
};

// Adds one Reader Sentence note (German + English, target word = lemma, `bold` = forms to bold) and shows where it stands.
export default function SentenceAnkiButton({
  de,
  en,
  word,
  source,
  bold,
  disabled = false,
}: {
  de: string;
  en: string;
  word: string;
  source: string;
  bold?: string[];
  disabled?: boolean;
}) {
  const state = useStore((s) => s.sentenceCards[sentenceKey(word, de)]);
  const add = useStore((s) => s.addSentenceCard);
  return (
    <button
      data-testid="sentence-anki"
      onClick={() => add(de, en, word, source, bold)}
      disabled={disabled || state === "adding" || state === "sent"}
      className="self-start px-2 py-1 rounded-lg text-[11px] font-semibold text-blue-400 border border-blue-400/25 hover:bg-blue-500/25 disabled:opacity-60"
    >
      {state ? LABEL[state] : "+ Anki"}
    </button>
  );
}
