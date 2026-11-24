"use client";
import { useMemo, useState } from "react";
import {
  dailySeries,
  dayLabel,
  niceTicks,
  type DayPoint,
  type ProgressHistory,
  type Range,
} from "@/lib/history";

const RANGES: { value: Range; label: string }[] = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: "all", label: "All" },
];
const BAR_SHARE = 18; // tallest "saved" bar as a percentage of the plot height
const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

const signed = (n: number) => `${n < 0 ? "−" : "+"}${Math.abs(n)}`;
const describeDay = (p: DayPoint) =>
  `${p.known} known, ${dayLabel(p.date)}, ${signed(p.gained)} known, ${p.saved} saved`;

/** Known-words line with a y-axis, daily "saved" bars, a 7/30/All switch and a hover/focus card per day. */
export default function KnownChart({
  history,
  today,
}: {
  history: ProgressHistory;
  today: string;
}) {
  const [range, setRange] = useState<Range>(30);
  const [active, setActive] = useState<number | null>(null);
  // Screen-reader text, filled only from keyboard so mouse hover doesn't flood the live region
  const [liveText, setLiveText] = useState("");
  const points = useMemo(
    () => dailySeries(history, today, range),
    [history, today, range],
  );
  const n = points.length;
  const ticks = niceTicks(
    Math.min(...points.map((p) => p.known)),
    Math.max(...points.map((p) => p.known)),
  );
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const maxSaved = Math.max(1, ...points.map((p) => p.saved));
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const y = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100;

  const line = points.map((p, i) => `${x(i)},${y(p.known)}`).join(" L");
  const area = `M${x(0)},100 L${line} L${x(n - 1)},100 Z`;
  const barW = (100 / n) * 0.5;

  const current = active === null ? null : points[Math.min(active, n - 1)];
  // Near the top of the plot the card flips below the point so it can't cover the range switch
  const cardBelow = current !== null && y(current.known) < 30;
  const first = points[0];
  const last = points[n - 1];
  const totalSaved = points.reduce((sum, p) => sum + p.saved, 0);

  // Arrow keys step through days so keyboard users get the same card as mouse hover
  function onKeyDown(e: React.KeyboardEvent) {
    const at = active ?? n - 1;
    const next = {
      ArrowLeft: at - 1,
      ArrowRight: at + 1,
      Home: 0,
      End: n - 1,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    showFromKeyboard(Math.max(0, Math.min(n - 1, next)));
  }

  function showFromKeyboard(i: number) {
    setActive(i);
    setLiveText(describeDay(points[i]));
  }

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.floor(((e.clientX - box.left) / box.width) * n);
    setActive(Math.max(0, Math.min(n - 1, i)));
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-semibold text-ink">Known words over time</h2>
        <div
          role="group"
          aria-label="Chart range"
          className="flex overflow-hidden rounded-lg border border-line"
        >
          {RANGES.map((r) => (
            <button
              key={r.label}
              type="button"
              aria-pressed={range === r.value}
              onClick={() => {
                setRange(r.value);
                setActive(null);
              }}
              className={`px-3 py-1.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                range === r.value
                  ? "bg-accent-soft text-ink"
                  : "text-muted hover:text-ink"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <p className="sr-only">
        {`From ${dayLabel(first.date)} to today known words went from ${first.known - first.gained} to ${last.known}, with ${totalSaved} words saved or levelled up. Use the arrow keys on the chart to read each day.`}
      </p>
      <div className="mt-4 flex gap-3">
        <div
          className="relative h-56 w-9 flex-none text-xs text-faint"
          aria-hidden
        >
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 -translate-y-1/2"
              style={{ top: `${y(t)}%` }}
            >
              {t}
            </span>
          ))}
        </div>
        <div
          tabIndex={0}
          role="group"
          aria-label="Known words per day chart"
          onKeyDown={onKeyDown}
          onMouseMove={onMouseMove}
          onMouseLeave={() => setActive(null)}
          onFocus={() => showFromKeyboard(active ?? n - 1)}
          onBlur={() => setActive(null)}
          className={`relative h-56 flex-1 rounded ${FOCUS}`}
        >
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute inset-x-0 border-t border-line"
              style={{ top: `${y(t)}%` }}
            />
          ))}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden
          >
            <path d={area} fill="var(--accent-soft)" />
            <path
              d={`M${line}`}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
            {points.map((p, i) => (
              <rect
                key={p.date}
                x={x(i) - barW / 2}
                width={barW}
                y={100 - (p.saved / maxSaved) * BAR_SHARE}
                height={(p.saved / maxSaved) * BAR_SHARE}
                fill="var(--faint)"
                opacity={0.6}
              />
            ))}
          </svg>
          {current && (
            <div aria-hidden>
              <div
                className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink"
                style={{
                  left: `${x(points.indexOf(current))}%`,
                  top: `${y(current.known)}%`,
                }}
              />
              <div
                className={`pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[13px] text-ink ${
                  cardBelow ? "" : "-translate-y-full"
                }`}
                style={{
                  left: `clamp(70px, ${x(points.indexOf(current))}%, calc(100% - 70px))`,
                  top: `calc(${y(current.known)}% ${cardBelow ? "+" : "-"} 10px)`,
                }}
              >
                {current.known} known
                <div className="text-xs text-faint">
                  {dayLabel(current.date)} · {signed(current.gained)} ·{" "}
                  {current.saved} saved
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {liveText}
      </p>
      <div className="ml-12 mt-2 flex justify-between text-xs text-faint">
        <span>{dayLabel(first.date)}</span>
        <span>Today</span>
      </div>
    </section>
  );
}
