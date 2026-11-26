"use client";
import { useEffect, useRef, useState } from "react";
import { fetchSettings, saveSettings } from "@/lib/api";
import { select } from "./AiModel";

const DEFAULT_WORDS = "German::Reader::Words";
const DEFAULT_SENTENCES = "German::Reader::Sentences";

/** Two text inputs for the decks new cards go to; saved when the field loses focus, blank means the default. */
export default function AnkiDeckNames() {
  const [words, setWords] = useState("");
  const [sentences, setSentences] = useState("");
  // only an edited field is saved: a blur before the settings load must not reset a custom name
  const edited = useRef({ words: false, sentences: false });
  const saveIfEdited = (key: "words" | "sentences", value: string) => {
    if (!edited.current[key]) return;
    edited.current[key] = false;
    saveSettings({ [`anki_deck_${key}`]: value }).catch(() => {});
  };

  useEffect(() => {
    fetchSettings()
      .then((s) => {
        // a field typed into before the load keeps what was typed
        if (!edited.current.words) setWords(s.anki_deck_words ?? "");
        if (!edited.current.sentences)
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
          onChange={(e) => {
            edited.current.words = true;
            setWords(e.target.value);
          }}
          onBlur={() => saveIfEdited("words", words)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-ink">
        Deck for sentence cards
        <input
          className={select}
          value={sentences}
          placeholder={DEFAULT_SENTENCES}
          onChange={(e) => {
            edited.current.sentences = true;
            setSentences(e.target.value);
          }}
          onBlur={() => saveIfEdited("sentences", sentences)}
        />
      </label>
    </div>
  );
}
