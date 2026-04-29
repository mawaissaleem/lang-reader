"use client";

import useStore from "@/store/useStore";
import WordToken from "@/components/WordToken";

function tokenize(text: string): string[] {
  // Split on whitespace but keep punctuation attached to words
  return text.split(/(\s+)/);
}

export default function TextDisplay() {
  const { text, highlightMode, setHighlightMode } = useStore();

  const paragraphs = text.split(/\n+/).filter(Boolean);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-6 p-3 bg-white border rounded-lg shadow-sm">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Known word style:
        </span>
        <div className="flex rounded-lg border overflow-hidden">
          <button
            onClick={() => setHighlightMode("underline")}
            className={`px-3 py-1.5 text-sm transition-colors ${
              highlightMode === "underline"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            Underline
          </button>
          <button
            onClick={() => setHighlightMode("highlight")}
            className={`px-3 py-1.5 text-sm border-l transition-colors ${
              highlightMode === "highlight"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            Highlight
          </button>
        </div>

        {/* Legend */}
        <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-blue-100 border border-blue-300" />
            Known
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-gray-200 border border-gray-300" />
            Unknown
          </span>
        </div>
      </div>

      {/* Text */}
      <div className="bg-white border rounded-xl shadow-sm p-8 leading-8 text-[1.05rem]">
        {paragraphs.map((para, pi) => (
          <p key={pi} className="mb-5 last:mb-0">
            {tokenize(para).map((token, ti) => {
              // Whitespace tokens — render as-is
              if (/^\s+$/.test(token)) {
                return <span key={ti}>{token}</span>;
              }
              return (
                <WordToken
                  key={ti}
                  word={token}
                  highlightMode={highlightMode}
                />
              );
            })}
          </p>
        ))}
      </div>
    </div>
  );
}
