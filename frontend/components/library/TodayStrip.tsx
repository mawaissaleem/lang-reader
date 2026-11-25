"use client";
import GoalRing from "@/components/GoalRing";
import type { ProgressHistory } from "@/lib/history";
import { newPer100, type Progress } from "@/lib/progress";
import type { LibraryEntry } from "@/lib/api";

/** Library "Today" strip: daily goal ring, streak, and the easiest unfinished entry with a Continue button. */
export default function TodayStrip({
  history,
  next,
  nextProgress,
  nextLoading,
  onContinue,
}: {
  history: ProgressHistory | null;
  next?: LibraryEntry;
  nextProgress?: Progress;
  nextLoading: boolean;
  onContinue: (entry: LibraryEntry) => void;
}) {
  if (!history) return null;
  const left = Math.max(0, history.goal - history.today);
  const { current, longest } = history.streak;
  return (
    <section
      aria-label="Today"
      className="mb-8 grid overflow-hidden rounded-2xl border border-line bg-surface md:grid-cols-[300px_260px_1fr]"
    >
      <div className="flex items-center gap-4 p-5">
        <GoalRing today={history.today} goal={history.goal} />
        <div>
          <div className="font-semibold text-ink">Today&apos;s goal</div>
          <div className="text-[13px] text-muted">
            {left > 0
              ? `${left} more words saved or levelled up`
              : "Goal reached"}
          </div>
        </div>
      </div>
      <div className="border-line p-5 md:border-l">
        <div className="font-serif text-3xl text-ink">
          {current}{" "}
          <span className="font-sans text-[15px] text-muted">day streak</span>
        </div>
        <div className="mt-1.5 text-[13px] text-muted">
          Longest {longest}
          {current === 0 && " · save a word to start one"}
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 border-line p-5 md:border-l">
        <UpNext
          next={next}
          nextProgress={nextProgress}
          nextLoading={nextLoading}
          onContinue={onContinue}
        />
      </div>
    </section>
  );
}

/** The "Up next" cell: the easiest unfinished entry, or a note that nothing is left. */
function UpNext({
  next,
  nextProgress,
  nextLoading,
  onContinue,
}: {
  next?: LibraryEntry;
  nextProgress?: Progress;
  nextLoading: boolean;
  onContinue: (entry: LibraryEntry) => void;
}) {
  // empty until library progress arrives, so "nothing left" doesn't flash on load
  if (nextLoading) return null;
  if (!next || !nextProgress) {
    return (
      <div className="text-sm text-muted">Nothing left to learn here.</div>
    );
  }
  return (
    <>
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wider text-accent">
          Up next · easiest for you
        </div>
        <div className="truncate font-serif text-xl text-ink">{next.title}</div>
        <div className="text-[13px] text-muted">
          About {newPer100(nextProgress)} new words per 100
        </div>
      </div>
      <button
        type="button"
        onClick={() => onContinue(next)}
        className="flex-none rounded-lg bg-[image:var(--grad)] px-5 py-2.5 text-sm font-semibold text-on-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
      >
        Continue
      </button>
    </>
  );
}
