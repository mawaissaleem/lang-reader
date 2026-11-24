"use client";
import clsx from "clsx";
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

/** Compact word card under the player: shown while a word is selected and the side panel is closed. */
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

  if (!word || panelOpen) return null;

  // the in-sentence meaning when the AI already gave one, else the first sense of the open source
  const meaning =
    ai?.status === "done"
      ? ai.answer.result.meaning_in_context
      : source
        ? result?.translations[source]?.meanings[0]
        : undefined;

  return (
    <section
      data-testid="word-card"
      className="mt-3 rounded-xl border border-line bg-surface px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2"
    >
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
