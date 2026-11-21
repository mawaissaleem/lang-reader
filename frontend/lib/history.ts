export interface ProgressHistory {
  known: number;
  before: number; // known words with no recorded date
  days: [string, number][]; // [YYYY-MM-DD, cumulative known] on days it grew
  streak: { current: number; longest: number };
}

const DAY = 86400000;
const t = (d: string) => Date.parse(d + "T00:00:00Z");

// Step-line points: starts at the untracked total, steps up on each growth day, runs flat to `today`.
export function chartPoints(
  h: ProgressHistory,
  today: string,
  w: number,
  hgt: number,
): string {
  const x0 = h.days.length ? t(h.days[0][0]) - DAY : t(today) - DAY;
  const span = Math.max(t(today) - x0, DAY);
  const max = Math.max(h.known, 1);
  const px = (ms: number) => ((ms - x0) / span) * w;
  const py = (v: number) => hgt - (v / max) * hgt;
  const pts: [number, number][] = [[0, py(h.before)]];
  let prev = h.before;
  for (const [d, n] of h.days) {
    pts.push([px(t(d)), py(prev)], [px(t(d)), py(n)]);
    prev = n;
  }
  pts.push([w, py(prev)]);
  return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

// "6 May", or "6 May 2025" when the range crosses a year.
export function axisLabels(first: string, today: string): [string, string] {
  const fmt = (d: string, year: boolean) =>
    new Date(t(d)).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      ...(year && { year: "numeric" }),
      timeZone: "UTC",
    });
  const y = first.slice(0, 4) !== today.slice(0, 4);
  return [fmt(first, y), fmt(today, y)];
}
