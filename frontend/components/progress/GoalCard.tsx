"use client";
import { useState } from "react";
import GoalRing from "@/components/GoalRing";
import { setDailyGoal } from "@/lib/api";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/** Progress-page goal card: the shared ring, words left today, and a small form to change the daily goal. */
export default function GoalCard({
  today,
  goal,
  onSaved,
}: {
  today: number;
  goal: number;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(goal));
  const [error, setError] = useState<string | null>(null);
  const left = Math.max(0, goal - today);
  const n = Number(value);
  const valid = Number.isInteger(n) && n >= 1 && n <= 1000;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    try {
      await setDailyGoal(n);
      setError(null);
      setEditing(false);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section
      aria-label="Daily goal"
      className="flex flex-wrap items-center gap-x-5 gap-y-4 rounded-2xl border border-line bg-surface p-6"
    >
      <div className="shrink-0">
        <GoalRing today={today} goal={goal} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-ink">Today&apos;s goal</div>
        <div className="text-[13px] text-muted">
          {left > 0
            ? `${left} more words saved or levelled up`
            : "Goal reached"}
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setValue(String(goal));
              setEditing(true);
            }}
            className={`mt-2 rounded-lg border border-line px-3 py-1 text-sm text-ink ${FOCUS}`}
          >
            Change goal
          </button>
        )}
      </div>
      {/* the form gets its own full-width row so it never spills out of the card */}
      {editing && (
        <form onSubmit={save} className="flex basis-full items-center gap-2">
          <label className="sr-only" htmlFor="goal-input">
            Words per day
          </label>
          <input
            id="goal-input"
            type="number"
            min={1}
            max={1000}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={`w-16 rounded-lg border border-line bg-bg px-2 py-1 text-sm text-ink ${FOCUS}`}
          />
          <button
            type="submit"
            disabled={!valid}
            className={`rounded-lg bg-[image:var(--grad)] px-3 py-1 text-sm font-semibold text-on-accent disabled:opacity-40 ${FOCUS}`}
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className={`rounded-lg px-2 py-1 text-sm text-muted ${FOCUS}`}
          >
            Cancel
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="basis-full text-xs text-hard">
          {error}
        </p>
      )}
    </section>
  );
}
