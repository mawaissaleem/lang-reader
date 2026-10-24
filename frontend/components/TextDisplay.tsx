"use client";
import useStore from "@/store/useStore";
import WordToken from "@/components/WordToken";
import { useEffect } from "react";
import { sentenceAt } from "@/lib/words";
import { NEW_CLASS, STATUS_CLASS, statusForKey } from "@/lib/status";

const LEGEND: [string, string, string][] = [
  ["New", NEW_CLASS, "·"],
  ["Learning 1", STATUS_CLASS.learning1.highlight, "1"],
  ["2", STATUS_CLASS.learning2.highlight, "2"],
  ["3", STATUS_CLASS.learning3.highlight, "3"],
  ["Known", "border border-white/20 text-white/75", "K"],
  ["Ignored", "border border-white/10 text-white/30", "I"],
];

export default function TextDisplay() {
  const text = useStore((s) => s.text);
  const title = useStore((s) => s.title);
  const highlightMode = useStore((s) => s.highlightMode);
  const setHighlightMode = useStore((s) => s.setHighlightMode);
  const setWordStatus = useStore((s) => s.setWordStatus);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const status = statusForKey(e);
      if (status) setWordStatus(status);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setWordStatus]);
  const paragraphs = text.split(/\n+/).filter(Boolean);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-6 px-4 py-2.5 bg-[#1a1a1f] border border-white/[0.07] rounded-xl">
        <span className="text-[10px] font-bold tracking-widest uppercase text-white/25">
          Learning word style
        </span>
        <div className="flex rounded-lg overflow-hidden border border-white/[0.08]">
          <button
            onClick={() => setHighlightMode("underline")}
            className={`px-3 py-1.5 text-[12px] font-medium transition-colors ${
              highlightMode === "underline"
                ? "bg-blue-500/20 text-blue-400"
                : "bg-transparent text-white/30 hover:text-white/60 hover:bg-white/[0.04]"
            }`}
          >
            Underline
          </button>
          <button
            onClick={() => setHighlightMode("highlight")}
            className={`px-3 py-1.5 text-[12px] font-medium border-l border-white/[0.08] transition-colors ${
              highlightMode === "highlight"
                ? "bg-blue-500/20 text-blue-400"
                : "bg-transparent text-white/30 hover:text-white/60 hover:bg-white/[0.04]"
            }`}
          >
            Highlight
          </button>
        </div>
        {/* Legend */}
        <div className="ml-auto flex items-center gap-4 text-[11px] text-white/25">
          {LEGEND.map(([label, cls, key]) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className={`px-1 rounded text-[10px] ${cls}`}>{key}</span>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Text area */}
      <div className="bg-[#111114] border border-white/[0.07] rounded-2xl p-8 leading-8 text-[1.05rem]">
        {/* Title */}
        {title && (
          <h2 className="text-white/90 text-xl font-semibold mb-6 pb-4 border-b border-white/[0.07] text-center">
            {title}
          </h2>
        )}

        {paragraphs.map((para, pi) => {
          const tokens = para.split(/(\s+)/);
          return (
            <p key={pi} className="mb-6 last:mb-0 text-white/75 leading-[1.9]">
              {tokens.map((token, ti) =>
                /^\s+$/.test(token) ? (
                  <span key={ti}>{token}</span>
                ) : (
                  <WordToken
                    key={ti}
                    id={`${pi}:${ti}`}
                    word={token}
                    highlightMode={highlightMode}
                    sentence={() => sentenceAt(tokens, ti)}
                  />
                ),
              )}
            </p>
          );
        })}
      </div>
    </div>
  );
}
