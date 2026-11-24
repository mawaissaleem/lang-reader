"use client";
import { useEffect, useState } from "react";
import {
  markNewWordsKnown,
  undoMarkNewWordsKnown,
  USER_ID,
  type PageMarkResult,
} from "@/lib/api";
import { isHotkeyEvent } from "@/lib/status";
import useStore from "@/store/useStore";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/** Reader toolbar for a paged text: dots with "Page 2 of 5", and "Finish page" which marks the page's new words known after asking. Left/Right arrows turn pages. */
export default function PageBar({
  page,
  pageCount,
  onPage,
  newWords,
}: {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  newWords: string[];
}) {
  const loadUserWords = useStore((s) => s.loadUserWords);
  const [busy, setBusy] = useState(false);
  const [undoable, setUndoable] = useState<PageMarkResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // no dependency list: re-subscribed each render so the handler always sees the current page
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isHotkeyEvent(e)) return;
      if (e.key === "ArrowLeft" && page > 0) goTo(page - 1);
      if (e.key === "ArrowRight" && page < pageCount - 1) goTo(page + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Undo is offered only on the page it was done on, so it never removes words out of sight.
  function goTo(next: number) {
    setUndoable(null);
    onPage(next);
  }

  // Runs a request, then reloads the saved words so colours and counts follow the server.
  async function run(request: () => Promise<PageMarkResult | null>) {
    setBusy(true);
    setError(null);
    try {
      const result = await request();
      setUndoable(result?.changed ? result : null);
      await loadUserWords(USER_ID);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function finish() {
    const n = newWords.length;
    if (!n) return;
    const ok = window.confirm(
      `Mark ${n} new word${n === 1 ? "" : "s"} on this page as known?`,
    );
    if (ok) run(() => markNewWordsKnown(newWords, USER_ID));
  }

  function undo() {
    if (!undoable) return;
    run(async () => {
      await undoMarkNewWordsKnown(undoable, USER_ID);
      return null;
    });
  }

  return (
    <div className="flex items-center gap-3 text-[12px] text-muted">
      {pageCount > 1 && (
        <>
          <span className="tabular-nums">
            Page {page + 1} of {pageCount}
          </span>
          <span className="flex items-center gap-0.5">
            {Array.from({ length: pageCount }, (_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Page ${i + 1}`}
                aria-current={i === page ? "page" : undefined}
                onClick={() => goTo(i)}
                className={`flex h-5 w-4 items-center justify-center rounded ${FOCUS}`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${i === page ? "bg-accent" : "bg-line"}`}
                />
              </button>
            ))}
          </span>
        </>
      )}
      {error && (
        <span role="alert" className="text-[var(--warn-text)]">
          {error}
        </span>
      )}
      {undoable && !busy && (
        <span role="status" className="flex items-center gap-2">
          {undoable.changed} marked known
          <button
            type="button"
            onClick={undo}
            className={`rounded px-1 text-accent underline ${FOCUS}`}
          >
            Undo
          </button>
        </span>
      )}
      <button
        type="button"
        disabled={busy || newWords.length === 0}
        onClick={finish}
        className={`rounded-lg border border-line px-3 py-1 text-ink hover:bg-surface-2 disabled:opacity-50 ${FOCUS}`}
      >
        Finish page · {newWords.length} new → known
      </button>
    </div>
  );
}
