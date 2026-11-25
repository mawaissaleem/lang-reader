"use client";
import { useEffect, useState } from "react";
import { fetchSettings, saveSettings } from "@/lib/api";
import { select } from "./AiModel";

const DEFAULT_WORDS = "German::Reader::Words";
const DEFAULT_SENTENCES = "German::Reader::Sentences";

/** Two text inputs for the decks new cards go to; saved when the field loses focus, blank means the default. */
export default function AnkiDeckNames() {
  const [words, setWords] = useState("");
  const [sentences, setSentences] = useState("");

  useEffect(() => {
    fetchSettings()
      .then((s) => {
        setWords(s.anki_deck_words ?? "");
        setSentences(s.anki_deck_sentences ?? "");
      })
      .catch(() => {});
  }, []);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm text-ink">
        Deck for word cards
        <input
          className={select}
          value={words}
          placeholder={DEFAULT_WORDS}
          onChange={(e) => setWords(e.target.value)}
          onBlur={() =>
            saveSettings({ anki_deck_words: words }).catch(() => {})
          }
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-ink">
        Deck for sentence cards
        <input
          className={select}
          value={sentences}
          placeholder={DEFAULT_SENTENCES}
          onChange={(e) => setSentences(e.target.value)}
          onBlur={() =>
            saveSettings({ anki_deck_sentences: sentences }).catch(() => {})
          }
        />
      </label>
    </div>
  );
}
