"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import useStore from "@/store/useStore";
import { aiKey } from "@/types";
import { fetchLlmModels } from "@/lib/api";

/** True once the backend lists a usable Ollama model; false while unknown or when Ollama is unreachable. */
function useOllamaReady(): boolean {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    fetchLlmModels()
      .then(
        (m) => live && setReady(!!(m.selected || m.default || m.models.length)),
      )
      .catch(() => live && setReady(false));
    return () => {
      live = false;
    };
  }, []);
  return ready;
}

/** "In this sentence": the AI's meaning for the clicked word, fetched only on request so the model isn't started on every click. */
export default function InSentenceBox() {
  const word = useStore((s) => s.selectedWord);
  const sentence = useStore((s) => s.selectedSentence);
  const entry = useStore((s) =>
    s.selectedWord && s.selectedSentence
      ? s.ai[aiKey(s.selectedWord, s.selectedSentence)]
      : undefined,
  );
  const askAi = useStore((s) => s.askAi);
  const ollamaReady = useOllamaReady();

  if (!word || !sentence) return null;
  // an answer the AI tab already fetched stays visible even if Ollama has since gone away
  if (!ollamaReady && entry?.status !== "done") return null;

  return (
    <section
      data-testid="in-sentence"
      className="rounded-xl p-4 bg-accent-soft border border-line"
    >
      <p className="text-[10px] font-bold tracking-widest uppercase text-accent mb-1.5">
        In this sentence
      </p>
      {entry?.status === "done" ? (
        <p className="text-[15px] text-ink leading-snug m-0">
          {entry.answer.result.meaning_in_context}
        </p>
      ) : entry?.status === "loading" ? (
        <p className="flex items-center gap-2 text-[12px] text-muted m-0">
          <Loader2 size={14} className="animate-spin" />
          Asking the model…
        </p>
      ) : (
        <div className="flex flex-col items-start gap-1.5">
          {entry?.status === "error" && (
            <p className="text-[12px] text-hard m-0">{entry.error}</p>
          )}
          <button
            onClick={askAi}
            className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-accent text-on-accent hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {entry ? "Retry" : "Meaning in this sentence"}
          </button>
        </div>
      )}
    </section>
  );
}
