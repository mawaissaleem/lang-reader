"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchProgressHistory } from "@/lib/api";
import { chartPoints, type ProgressHistory } from "@/lib/history";

const USER_ID = 1;
const W = 600;
const H = 200;

export default function ProgressPage() {
  const [data, setData] = useState<ProgressHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProgressHistory(USER_ID).then(setData).catch((e: Error) => setError(e.message));
  }, []);

  // local date, the same day boundary the backend used for the caller's timezone
  const today = new Date().toLocaleDateString("en-CA");

  return (
    <main className="min-h-screen bg-[#0a0a0f] px-6 py-10 text-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="mx-auto max-w-2xl">
        <Link href="/library" className="text-sm text-white/40 hover:text-white/80">← Library</Link>
        <h1 className="mt-4 text-3xl" style={{ fontFamily: "'DM Serif Display', serif" }}>Progress</h1>
        {error && <p className="mt-6 text-sm text-red-400">{error}</p>}
        {!data && !error && <p className="mt-6 text-sm text-white/40">Loading…</p>}
        {data && (
          <>
            <section className="mt-8 grid grid-cols-3 gap-4">
              <Stat label="Known words" value={data.known} />
              <Stat label="Day streak" value={data.streak.current} />
              <Stat label="Longest streak" value={data.streak.longest} />
            </section>
            <p className="mt-3 text-xs text-white/40">
              A streak counts consecutive days, up to today, on which you saved a word or changed a word&apos;s status. A day without activity yet today does not break it.
            </p>
            <section className="mt-10">
              <h2 className="mb-3 text-sm text-white/60">Known words over time</h2>
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl border border-white/10 bg-white/5" role="img" aria-label={`Known words over time, now ${data.known}`}>
                <polyline points={chartPoints(data, today, W, H)} fill="none" stroke="#60a5fa" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </svg>
              {data.before > 0 && <p className="mt-2 text-xs text-white/40">{data.before} known words have no recorded date; they form the starting level.</p>}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-3xl" style={{ fontFamily: "'DM Serif Display', serif" }}>{value}</div>
      <div className="mt-1 text-xs text-white/50">{label}</div>
    </div>
  );
}
