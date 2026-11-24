import { activityGrid, dayLabel, type ProgressHistory } from "@/lib/history";

// One class per intensity level 0-3; the middle levels mix the accent into the empty-cell colour
// because Tailwind cannot apply an opacity modifier to a CSS-variable colour
const LEVEL_BG = [
  "bg-surface-2",
  "bg-[color-mix(in_srgb,var(--accent)_30%,var(--surface-2))]",
  "bg-[color-mix(in_srgb,var(--accent)_60%,var(--surface-2))]",
  "bg-accent",
];

/** 12-week grid of words saved or levelled up per day, one column per 7 days, today last. */
export default function ActivityGrid({
  history,
  today,
}: {
  history: ProgressHistory;
  today: string;
}) {
  const cells = activityGrid(history, today);
  const total = cells.reduce((sum, c) => sum + c.saved, 0);
  const active = cells.filter((c) => c.saved > 0).length;
  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <h2 className="font-semibold text-ink">
        Activity, last 12 weeks{" "}
        <span className="text-[13px] font-normal text-muted">
          words saved or levelled up per day
        </span>
      </h2>
      <div
        role="img"
        aria-label={`${total} words saved or levelled up over the last 12 weeks, on ${active} of 84 days`}
        className="mt-4 grid auto-cols-fr grid-flow-col grid-rows-7 gap-1"
      >
        {cells.map((c) => (
          <div
            key={c.date}
            title={`${dayLabel(c.date)}: ${c.saved} saved`}
            className={`h-5 rounded-sm ${LEVEL_BG[c.level]}`}
          />
        ))}
      </div>
      <div className="mt-3 flex justify-between text-xs text-faint">
        <span>{dayLabel(cells[0].date)}</span>
        <span>Today</span>
      </div>
    </section>
  );
}
