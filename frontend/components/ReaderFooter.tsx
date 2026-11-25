"use client";
import { useMemo } from "react";
import useStore from "@/store/useStore";
import { countProgress, knownPct } from "@/lib/progress";
import {
  NEW_CLASS,
  STATUSES,
  STATUS_CLASS,
  STATUS_HOTKEY,
  type WordStatus,
} from "@/lib/status";

const LEGEND_LABEL: Record<WordStatus, string> = {
  learning1: "Learning 1",
  learning2: "2",
  learning3: "3",
  known: "Known",
  ignored: "Ignored",
};
// status colour swatches with the key that sets each status
const LEGEND: [string, string, string][] = [
  ["New", NEW_CLASS, "·"],
  ...STATUSES.map((status): [string, string, string] => {
    const hasBorder = status === "known" || status === "ignored";
    const highlight = STATUS_CLASS[status].highlight;
    return [
      LEGEND_LABEL[status],
      hasBorder ? `border border-line ${highlight}` : highlight,
      STATUS_HOTKEY[status].toUpperCase(),
    ];
  }),
];

/** Word-count summary of a text, optionally with the status legend; `className` lets the reader header reuse it without the footer spacing. */
export default function ReaderFooter({
  text,
  legend = false,
  className = "mt-3 px-4 py-2",
}: {
  text: string;
  legend?: boolean;
  className?: string;
}) {
  const userWords = useStore((s) => s.userWords);
  const p = useMemo(() => countProgress(text, userWords), [text, userWords]);
  return (
    <div
      className={`${className} flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted tabular-nums`}
    >
      <span>
        {p.total} unique words · {knownPct(p)}% known · {p.learning} learning ·{" "}
        {p.new} new in this text
      </span>
      {legend && (
        <span className="ml-auto flex items-center gap-3 text-[11px]">
          {LEGEND.map(([label, cls, key]) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className={`px-1 rounded text-[10px] ${cls}`}>{key}</span>
              {label}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
