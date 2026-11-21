"use client";
import { useMemo } from "react";
import useStore from "@/store/useStore";
import { countProgress, knownPct } from "@/lib/progress";

export default function ReaderFooter({ text }: { text: string }) {
  const userWords = useStore((s) => s.userWords);
  const p = useMemo(() => countProgress(text, userWords), [text, userWords]);
  return (
    <div className="mt-3 px-4 py-2 text-[12px] text-white/40 tabular-nums">
      {p.total} unique words · {knownPct(p)}% known · {p.learning} learning ·{" "}
      {p.new} new
    </div>
  );
}
