"use client";
import { useEffect, useState } from "react";
import AppNav from "@/components/AppNav";
import ActivityGrid from "@/components/progress/ActivityGrid";
import GoalCard from "@/components/progress/GoalCard";
import KnownChart from "@/components/progress/KnownChart";
import { fetchProgressHistory, USER_ID } from "@/lib/api";
import type { ProgressHistory } from "@/lib/history";

export default function ProgressPage() {
  const [data, setData] = useState<ProgressHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    fetchProgressHistory(USER_ID)
      .then(setData)
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  // local date, the same day boundary the backend used for the caller's timezone
  const today = new Date().toLocaleDateString("en-CA");

  return (
    <div className="min-h-screen text-ink">
      <AppNav />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="font-serif text-3xl">Progress</h1>
        {error && <p className="mt-6 text-sm text-hard">{error}</p>}
        {!data && !error && <p className="mt-6 text-sm text-muted">Loading…</p>}
        {data && (
          <div className="mt-8 grid gap-6">
            <div className="grid gap-6 md:grid-cols-3">
              <section
                aria-label="Known words"
                className="rounded-2xl border border-line bg-surface p-6"
              >
                <div className="font-serif text-5xl">{data.known}</div>
                <div className="mt-1 text-sm">
                  words known{" "}
                  <span
                    className={data.week_gain < 0 ? "text-hard" : "text-good"}
                  >
                    {data.week_gain < 0 ? "−" : "+"}
                    {Math.abs(data.week_gain)} this week
                  </span>
                </div>
                <p className="mt-3 text-xs text-muted">
                  Known = words you marked known, plus words Anki promoted to
                  known, plus words imported from your Anki decks.
                  {data.before > 0 &&
                    ` ${data.before} have no recorded date and form the starting level.`}
                </p>
              </section>
              <GoalCard today={data.today} goal={data.goal} onSaved={load} />
              <section
                aria-label="Streak"
                className="rounded-2xl border border-line bg-surface p-6"
              >
                <div className="font-serif text-5xl">
                  {data.streak.current}{" "}
                  <span className="font-sans text-base text-muted">days</span>
                </div>
                <div className="mt-1 text-sm">
                  current streak · longest {data.streak.longest}
                </div>
                <p className="mt-3 text-xs text-muted">
                  A day counts when you save a word or change a word&apos;s
                  status. A day without activity yet today does not break the
                  streak.
                </p>
              </section>
            </div>
            <KnownChart history={data} today={today} />
            <ActivityGrid history={data} today={today} />
          </div>
        )}
      </main>
    </div>
  );
}
