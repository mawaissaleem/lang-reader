"use client";
import clsx from "clsx";
import { useEffect } from "react";
import useStore from "@/store/useStore";
import { ARTICLE_CLASS } from "@/components/SidePanel";
import { aiKey, type WordStatus } from "@/types";

const LEVELS: { status: WordStatus; label: string }[] = [
  { status: "learning1", label: "1" },
  { status: "learning2", label: "2" },
  { status: "learning3", label: "3" },
  { status: "known", label: "Known" },
];

const small =
  "px-3 py-1 rounded-full text-[12px] border border-line transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/** Compact word card laid over the top of the (paused) video, so the meaning shows where you are looking; hidden while the side panel is open. */
export default function VideoWordCard() {
  const word = useStore((s) => s.selectedWord);
  const panelOpen = useStore((s) => s.sidePanelOpen);
  const result = useStore((s) => s.wordResult);
  const loading = useStore((s) => s.wordLoading);
  const error = useStore((s) => s.wordError);
  const saved = useStore((s) => s.wordSaved);
  const saving = useStore((s) => s.wordSaving);
  const saveError = useStore((s) => s.saveError);
  const source = useStore((s) => s.activeSource);
  const ai = useStore((s) =>
    s.selectedWord && s.selectedSentence
      ? s.ai[aiKey(s.selectedWord, s.selectedSentence)]
      : undefined,
  );
  const status = useStore((s) =>
    s.wordResult ? s.userWords[s.wordResult.word]?.status : undefined,
  );
  const setWordStatus = useStore((s) => s.setWordStatus);
  const save = useStore((s) => s.saveSelectedWord);
  const setPanelOpen = useStore((s) => s.setSidePanelOpen);
  const genderColours = useStore((s) => s.genderColours);
  const select = useStore((s) => s.setSelectedWord);
  const open = Boolean(word) && !panelOpen;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, select]);

  if (!open) return null;

  // the in-sentence meaning when the AI already gave one, else the first sense of the open source
  const meaning =
    ai?.status === "done"
      ? ai.answer.result.meaning_in_context
      : source
        ? result?.translations[source]?.meanings[0]
        : undefined;

  return (
    // sits on the video, so it keeps the dark look in every reader theme
    <section
      data-testid="word-card"
      data-theme="midnight"
      aria-label="Word"
      className="absolute inset-x-3 top-3 z-10 max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-xl border border-white/10 bg-black/85 backdrop-blur px-4 py-3 pr-10 flex flex-wrap items-center gap-x-6 gap-y-2 shadow-lg"
    >
      <button
        onClick={() => select(null)}
        aria-label="Close word card"
        title="Close (Esc)"
        className="absolute right-2 top-2 size-7 rounded-full text-muted hover:text-ink hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        ×
      </button>
      <div className="min-w-0 flex-1 basis-48">
        <p className="m-0 font-serif text-2xl leading-tight text-ink">
          {result?.article && (
            <span
              className={
                genderColours ? ARTICLE_CLASS[result.article] : undefined
              }
            >
              {result.article}{" "}
            </span>
          )}
          {result?.word ?? word}
        </p>
        <p className="m-0 text-sm text-muted">
          {loading ? "Looking up…" : (error ?? meaning ?? "No meaning found")}
        </p>
      </div>
      <div className="flex flex-col gap-2 items-end">
        <div className="flex gap-1.5" role="group" aria-label="Word level">
          <span
            className={clsx(
              small,
              !status ? "bg-accent-soft text-accent" : "text-faint",
            )}
          >
            New
          </span>
          {LEVELS.map((l) => (
            <button
              key={l.status}
              onClick={() => setWordStatus(l.status)}
              disabled={!result}
              aria-pressed={status === l.status}
              className={clsx(
                small,
                status === l.status
                  ? "bg-accent-soft text-accent"
                  : "text-muted hover:text-ink",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setPanelOpen(true)}
            className={clsx(small, "text-ink hover:bg-surface-2")}
          >
            Details
          </button>
          <button
            onClick={() => save(false)}
            disabled={!result?.id || saving || saved}
            className={clsx(
              small,
              "text-ink hover:bg-surface-2 disabled:opacity-60",
            )}
          >
            {saved ? "✓ Saved" : saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => save(true)}
            disabled={!result?.id || saving || saved}
            className={clsx(
              small,
              "bg-accent text-white border-accent disabled:opacity-60",
            )}
          >
            Save + Anki
          </button>
        </div>
      </div>
      {saveError && (
        <p className="basis-full m-0 text-[12px] text-[var(--warn-text)]">
          {saveError}
        </p>
      )}
    </section>
  );
}
