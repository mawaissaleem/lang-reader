export interface ProgressHistory {
  known: number;
  before: number; // known words with no recorded date
  days: [string, number][]; // [YYYY-MM-DD, cumulative known] on days it grew
  streak: { current: number; longest: number };
  saved: [string, number][]; // [YYYY-MM-DD, distinct words saved or levelled up] on days with any
  week_gain: number; // known now minus known 7 days ago
  today: number; // words saved or levelled up today
  goal: number; // daily target
}

export type Range = 7 | 30 | "all";
export interface DayPoint {
  date: string;
  known: number; // known words at the end of the day
  gained: number; // change in known words over the day
  saved: number; // distinct words saved or levelled up
}
export interface GridCell {
  date: string;
  saved: number;
  level: 0 | 1 | 2 | 3; // intensity relative to the busiest day in the grid
}

const DAY = 86400000;

/** Moves a YYYY-MM-DD date by whole days (done in UTC so no time zone or DST shift). */
export function addDays(date: string, n: number): string {
  return new Date(Date.parse(date + "T00:00:00Z") + n * DAY)
    .toISOString()
    .slice(0, 10);
}

/** "20 Nov" for a YYYY-MM-DD date. */
export function dayLabel(date: string): string {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** One point per day from the range start to `today`: known count, its change and the saved count. */
export function dailySeries(
  h: ProgressHistory,
  today: string,
  range: Range,
): DayPoint[] {
  const firstActive = [h.days[0]?.[0], h.saved[0]?.[0]].filter(Boolean).sort();
  const start =
    range === "all" ? (firstActive[0] ?? today) : addDays(today, -(range - 1));
  const saved = new Map(h.saved);
  // `days` holds the cumulative count on days it grew; walk it alongside the calendar
  let next = 0;
  let known = h.before;
  const knownOn = (date: string) => {
    while (next < h.days.length && h.days[next][0] <= date) {
      known = h.days[next][1];
      next++;
    }
    return known;
  };
  let prev = knownOn(addDays(start, -1));
  const out: DayPoint[] = [];
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const k = knownOn(d);
    out.push({ date: d, known: k, gained: k - prev, saved: saved.get(d) ?? 0 });
    prev = k;
  }
  return out;
}

/** Round axis ticks (1, 2 or 5 times a power of ten) covering min..max, about four steps. */
export function niceTicks(min: number, max: number): number[] {
  // A flat series gets room above and below so its line sits mid-chart, not on the bottom edge
  const bottom = max === min ? Math.max(0, min - 2) : min;
  const top = max === min ? max + 2 : max;
  const raw = (top - bottom) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const nice = [1, 2, 5, 10].map((m) => m * mag).find((x) => x >= raw) ?? mag;
  // Word counts are whole numbers, so never step by less than one
  const step = Math.max(1, nice);
  const lo = Math.floor(bottom / step) * step;
  const hi = Math.max(Math.ceil(top / step) * step, lo + step);
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  return ticks;
}

/** The last 12 weeks (84 days, oldest first, each 7 consecutive days a column) ending on `today`. */
export function activityGrid(h: ProgressHistory, today: string): GridCell[] {
  const saved = new Map(h.saved);
  const days = Array.from({ length: 84 }, (_, i) => addDays(today, i - 83));
  const max = Math.max(1, ...days.map((d) => saved.get(d) ?? 0));
  return days.map((date) => {
    const n = saved.get(date) ?? 0;
    const level = n === 0 ? 0 : Math.ceil((n / max) * 3);
    return { date, saved: n, level: level as GridCell["level"] };
  });
}

/** Share of the daily goal reached, 0-100 (capped so the ring never overfills). */
export const goalPct = (h: Pick<ProgressHistory, "today" | "goal">) =>
  h.goal > 0 ? Math.min(100, Math.round((h.today / h.goal) * 100)) : 0;
