"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import useStore from "@/store/useStore";
import { aiKey } from "@/types";
import PlayButton from "@/components/PlayButton";
import SentenceAnkiButton from "@/components/SentenceAnkiButton";

const BTN =
  "px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-400/25 hover:bg-blue-500/25";

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <>{Math.max(0, Math.floor((now - since) / 1000))}s</>;
}

export default function AiTab() {
  const word = useStore((s) => s.selectedWord);
  const sentence = useStore((s) => s.selectedSentence);
  const entry = useStore((s) =>
    s.selectedWord && s.selectedSentence
      ? s.ai[aiKey(s.selectedWord, s.selectedSentence)]
      : undefined,
  );
  const askAi = useStore((s) => s.askAi);

  if (!word || !sentence) {
    return (
      <p
        role="tabpanel"
        className="text-[12px] text-white/40 text-center py-6 m-0"
      >
        The AI needs the sentence the word is in.
      </p>
    );
  }
  if (!entry || entry.status === "error") {
    return (
      <div
        role="tabpanel"
        className="flex flex-col items-center gap-3 py-6 text-center"
      >
        {entry && (
          <p className="text-[12px] text-orange-400 m-0">{entry.error}</p>
        )}
        <button onClick={askAi} className={BTN}>
          {entry ? "Retry" : "Get examples"}
        </button>
      </div>
    );
  }
  if (entry.status === "loading") {
    return (
      <div
        role="tabpanel"
        className="flex flex-col items-center gap-2 py-6 text-center text-[12px] text-white/40"
      >
        <Loader2 size={18} className="animate-spin" />
        <span>
          Asking the model… <Elapsed since={entry.startedAt} /> · {entry.tokens}{" "}
          tokens
        </span>
        <span className="text-white/25">This can take 10–30 s or more</span>
      </div>
    );
  }
  const { result, model, cached } = entry.answer;
  return (
    <div role="tabpanel" className="flex flex-col gap-4">
      <p className="text-[13px] text-white/80 leading-relaxed m-0">
        {result.meaning_in_context}
      </p>
      <div
        data-testid="ai-sentence"
        className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4"
      >
        <p className="text-[13px] text-white/80 leading-relaxed m-0 mb-2">
          <PlayButton key={sentence} text={sentence} label="Play sentence" />{" "}
          {sentence}
        </p>
        <p className="text-[13px] text-blue-300/80 leading-relaxed m-0">
          {result.sentence_translation}
        </p>
      </div>
      <ul className="flex flex-col gap-3 m-0 p-0 list-none">
        {result.examples.map((ex, i) => (
          <li
            key={i}
            data-testid="ai-example"
            className="flex flex-col gap-0.5"
          >
            <span className="text-[13px] text-white/80">
              <PlayButton text={ex.de} label="Play sentence" /> {ex.de}
            </span>
            <span className="text-[12px] text-white/45">{ex.en}</span>
            <SentenceAnkiButton
              de={ex.de}
              en={ex.en}
              word={result.lemma}
              source="AI example"
            />
          </li>
        ))}
      </ul>
      {result.note && (
        <p
          data-testid="ai-note"
          className="text-[12px] text-white/55 leading-relaxed m-0"
        >
          {result.note}
        </p>
      )}
      <p className="text-[11px] text-white/30 m-0">
        answered by {model}
        {cached && " (cached)"}
      </p>
    </div>
  );
}
