import { goalPct, type ProgressHistory } from "@/lib/history";

/** Daily-goal ring with "today/goal" in the middle; shared by the library Today strip and the progress page. */
export default function GoalRing({
  today,
  goal,
}: Pick<ProgressHistory, "today" | "goal">) {
  return (
    <div
      role="img"
      aria-label={`${today} of ${goal} words today`}
      className="grid h-16 w-16 flex-none place-items-center rounded-full"
      style={{
        background: `conic-gradient(var(--accent) ${goalPct({ today, goal })}%, var(--surface-2) 0)`,
      }}
    >
      <span className="col-start-1 row-start-1 grid h-[50px] w-[50px] place-items-center rounded-full bg-surface text-[13px] font-bold text-ink">
        {today}/{goal}
      </span>
    </div>
  );
}
