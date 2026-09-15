"use client";

import useStore from "@/store/useStore";
import { X, BookOpen, HelpCircle, Loader2, Settings } from "lucide-react";
import clsx from "clsx";
import React from "react";

export default function SidePanel() {
  const {
    selectedWord, sidePanelOpen, setSidePanelOpen, setSelectedWord,
    wordResult, wordLoading, wordError, wordSaved, wordSaving, saveSelectedWord,
    translatorPriority, setTranslatorPriority,
  } = useStore();

  const [showPref, setShowPref] = React.useState(false);

  function handleClose() {
    setSidePanelOpen(false);
    setSelectedWord(null);
  }

  return (
    <aside
      className={clsx(
        "flex flex-col h-full flex-shrink-0 bg-[#111114] transition-all duration-300 overflow-hidden",
        sidePanelOpen
          ? "w-80 min-w-80 border-l border-white/[0.07]"
          : "w-0 min-w-0"
      )}
    >
      {sidePanelOpen && (
        <>
          {/* Header */}
          <div className="flex flex-col gap-2 px-5 py-4 border-b border-white/[0.07] flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen size={15} className="text-blue-400" />
                <span className="text-[13px] font-semibold text-white/80 tracking-tight">
                  Word Details
                </span>
              </div>
              <button
                onClick={handleClose}
                className="text-white/25 hover:text-white/70 transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            {/* Translator preference — open settings to change */}
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold text-white/60">Preferred translator:</div>
              <div className="flex items-center gap-2">
                <div className="text-[12px] font-semibold text-white/80 uppercase">
                  {translatorPriority === "pons" ? "PONS" : "LibreTranslate"}
                </div>
                <button
                  onClick={() => setShowPref((s) => !s)}
                  className="p-1 rounded hover:bg-white/[0.03] text-white/60"
                  aria-label="Translator settings"
                >
                  <Settings size={14} />
                </button>
              </div>
            </div>

            {showPref && (
              <div className="mt-2 p-3 rounded-lg bg-white/[0.03]">
                <div className="text-[12px] text-white/70 mb-2">Choose default translator</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setTranslatorPriority("pons"); setShowPref(false); }}
                    className={clsx(
                      "flex-1 py-1 rounded-md transition-all tracking-wide uppercase text-[12px] font-semibold",
                      translatorPriority === "pons"
                        ? "bg-blue-500/25 text-blue-300"
                        : "text-white/30 hover:text-white/55"
                    )}
                  >
                    PONS
                  </button>
                  <button
                    onClick={() => { setTranslatorPriority("libretranslate"); setShowPref(false); }}
                    className={clsx(
                      "flex-1 py-1 rounded-md transition-all tracking-wide uppercase text-[12px] font-semibold",
                      translatorPriority === "libretranslate"
                        ? "bg-blue-500/25 text-blue-300"
                        : "text-white/30 hover:text-white/55"
                    )}
                  >
                    LibreTranslate
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Body — independent scroll */}
          <div className="flex-1 overflow-y-auto p-5">
            {wordLoading ? (
              <div className="flex items-center gap-2 mt-4 text-[13px] text-white/35">
                <Loader2 size={15} className="animate-spin" />
                Looking up{" "}
                <strong className="text-white/60">{selectedWord}</strong>…
              </div>
            ) : wordError ? (
              <div className="flex flex-col items-center gap-3 mt-10 text-center">
                <HelpCircle size={32} className="text-red-400/40" />
                <p className="text-[14px] font-semibold text-white/60 m-0">
                  "{selectedWord}"
                </p>
                <p className="text-[12px] text-orange-400 m-0">{wordError}</p>
              </div>
            ) : wordResult ? (
              <div className="flex flex-col gap-5">
                {/* Word + class */}
                <div>
                  <div className="flex items-baseline gap-2 mb-1.5">
                    {wordResult.word_class && (
                      <span className="text-[10px] font-bold tracking-widest uppercase text-blue-400">
                        {wordResult.word_class}
                      </span>
                    )}
                    <h2 className="text-[26px] font-bold text-white/90 m-0 leading-tight tracking-tight" style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}>
                      {wordResult.word}
                    </h2>
                  </div>
                  <span className="inline-block text-[10px] font-semibold tracking-widest uppercase text-white/25 bg-white/5 px-2 py-0.5 rounded-full">
                    {wordResult.source === "cache"
                      ? "cached"
                      : wordResult.source === "libretranslate"
                      ? "LibreTranslate"
                      : "PONS"}
                  </span>
                </div>

                {/* Meanings */}
                <div className="bg-blue-500/[0.07] border border-blue-400/[0.15] rounded-xl p-4">
                  <p className="text-[10px] font-bold tracking-widest uppercase text-blue-400 mb-2.5">
                    English
                  </p>
                  <ul className="flex flex-col gap-1.5 m-0 p-0 list-none">
                    {wordResult.english_meanings.map((meaning, i) => (
                      <li key={i} className="flex gap-2 text-[13px] text-white/75 leading-relaxed">
                        <span className="text-blue-400/50 tabular-nums flex-shrink-0">
                          {i + 1}.
                        </span>
                        {meaning}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="text-[13px] text-white/20 mt-2">
                Click any word to see its meaning.
              </p>
            )}
          </div>

          {/* Save button — pinned to bottom */}
          <div className="px-5 py-4 border-t border-white/[0.07] flex-shrink-0">
            <button
              onClick={saveSelectedWord}
              disabled={wordSaving || wordSaved}
              className={clsx(
                "w-full py-2.5 rounded-xl text-[13px] font-semibold transition-all",
                wordSaved
                  ? "bg-green-500/10 text-green-400 border border-green-400/25 cursor-default"
                  : "bg-blue-500/15 text-blue-400 border border-blue-400/25 hover:bg-blue-500/25 disabled:opacity-60"
              )}
            >
              {wordSaving ? "Saving…" : wordSaved ? "✓ Saved to dictionary" : "Save to dictionary"}
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
