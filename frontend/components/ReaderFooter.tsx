"use client";
import { useMemo } from "react";
import useStore from "@/store/useStore";
import { countProgress, knownPct } from "@/lib/progress";
import { NEW_CLASS, STATUS_CLASS } from "@/lib/status";

// status colour swatches with the key that sets each status
const LEGEND: [string, string, string][] = [
  ["New", NEW_CLASS, "·"],
  ["Learning 1", STATUS_CLASS.learning1.highlight, "1"],
  ["2", STATUS_CLASS.learning2.highlight, "2"],
  ["3", STATUS_CLASS.learning3.highlight, "3"],
  ["Known", `border border-line ${STATUS_CLASS.known.highlight}`, "K"],
  ["Ignored", `border border-line ${STATUS_CLASS.ignored.highlight}`, "I"],
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
        {p.new} new
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
