"use client";
import useStore from "@/store/useStore";
import WordToken, { WordGap } from "@/components/WordToken";
import ReaderFooter from "@/components/ReaderFooter";
import { useStatusHotkeys } from "@/lib/useStatusHotkeys";
import { particleToken, sentenceAt } from "@/lib/words";

export default function TextDisplay() {
  const text = useStore((s) => s.text);
  const title = useStore((s) => s.title);
  const highlightMode = useStore((s) => s.highlightMode);
  const focusMode = useStore((s) => s.focusMode);
  // paragraph of the selected word; in focus mode the others fade
  const activePara = useStore((s) => s.selectedTokens[0]?.id.split(":")[0]);
  useStatusHotkeys();
  const paragraphs = text.split(/\n+/).filter(Boolean);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Text area */}
      <div className="bg-surface border border-line rounded-2xl p-8 leading-8">
        {/* Title */}
        {title && (
          <h2 className="text-ink text-xl font-semibold mb-6 pb-4 border-b border-line text-center">
            {title}
          </h2>
        )}

        {paragraphs.map((para, pi) => {
          const tokens = para.split(/(\s+)/);
          const faded =
            focusMode && activePara !== undefined && activePara !== String(pi);
          return (
            <p
              key={pi}
              className={`mb-6 last:mb-0 text-ink leading-[1.9] transition-opacity ${faded ? "opacity-30" : ""}`}
            >
              {tokens.map((token, ti) =>
                /^\s+$/.test(token) ? (
                  <WordGap key={ti} id={`${pi}:${ti}`} text={token} />
                ) : (
                  <WordToken
                    key={ti}
                    id={`${pi}:${ti}`}
                    word={token}
                    highlightMode={highlightMode}
                    sentence={() => sentenceAt(tokens, ti)}
                    findParticle={(p, skip) =>
                      particleToken(tokens, ti, p, skip, pi)
                    }
                  />
                ),
              )}
            </p>
          );
        })}
      </div>
      <ReaderFooter text={text} legend />
    </div>
  );
}
