import { useMemo } from "react";
import { countProgress, knownPct, newPer100 } from "@/lib/progress";
import { NEW_CLASS, STATUS_CLASS } from "@/lib/status";
import { cleanWord, entryFor } from "@/lib/words";
import type { WordStatus } from "@/types";

const PREVIEW_CHARS = 420; // about the first three lines of the dialog

const CAPTION_LABEL = {
  creator: "Creator captions",
  auto: "Auto captions",
} as const;

interface Props {
  text: string;
  userWords: Record<string, { status: WordStatus }>;
  /** Shown for videos only; null hides it. */
  captionSource?: "creator" | "auto" | null;
}

/** The first lines of a text with the reader's word colours, plus word count, % known and new words per 100. */
export default function AddPreview({ text, userWords, captionSource }: Props) {
  const stats = useMemo(() => {
    const progress = countProgress(text, userWords);
    return {
      words: text.split(/\s+/).filter(Boolean).length,
      known: knownPct(progress),
      newPer100: newPer100(progress),
    };
  }, [text, userWords]);

  // Splitting on whitespace keeps the spaces as tokens so the lines wrap as in the text.
  const tokens = text.slice(0, PREVIEW_CHARS).split(/(\s+)/);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">
        Preview: first lines, with your words already coloured
      </p>
      <p className="max-h-40 overflow-hidden rounded-2xl border border-line bg-surface-2 px-4 py-3 font-reading text-base leading-8 text-ink">
        {tokens.map((token, i) => {
          const word = cleanWord(token);
          if (!word) return token;
          const status = entryFor(userWords, word)?.status;
          const cls = status ? STATUS_CLASS[status].highlight : NEW_CLASS;
          return (
            <span key={i} className={`rounded px-0.5 ${cls}`}>
              {token}
            </span>
          );
        })}
        {text.length > PREVIEW_CHARS && "…"}
      </p>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        <span>
          <b className="text-ink">{stats.words.toLocaleString()}</b> words
        </span>
        <span>
          <b className="text-ink">{stats.known}%</b> known
        </span>
        <span>
          <b className="text-ink">{stats.newPer100}</b> new per 100
        </span>
        {captionSource && (
          <span className="rounded-md bg-amber-400/10 px-2 py-0.5 text-xs text-amber-300">
            {CAPTION_LABEL[captionSource]}
          </span>
        )}
      </p>
    </div>
  );
}
