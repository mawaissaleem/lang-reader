"use client";
import useStore from "@/store/useStore";
import WordToken from "@/components/WordToken";

function tokenize(text: string): string[] {
  return text.split(/(\s+)/);
}

export default function TextDisplay() {
  const { text, highlightMode, setHighlightMode } = useStore();
  const paragraphs = text.split(/\n+/).filter(Boolean);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-6 px-4 py-2.5 bg-[#1a1a1f] border border-white/[0.07] rounded-xl">
        <span className="text-[10px] font-bold tracking-widest uppercase text-white/25">
          Known word style
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
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-blue-500/20 border border-blue-400/30" />
            Known
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-white/[0.06] border border-white/10" />
            Unknown
          </span>
        </div>
      </div>

      {/* Text area */}
      <div className="bg-[#111114] border border-white/[0.07] rounded-2xl p-8 leading-8 text-[1.05rem]">
        {paragraphs.map((para, pi) => (
          <p key={pi} className="mb-6 last:mb-0 text-white/75 leading-[1.9]">
            {tokenize(para).map((token, ti) => {
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
