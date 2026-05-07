"use client";

import useStore from "@/store/useStore";
import { X, BookOpen, HelpCircle, Loader2 } from "lucide-react";
import clsx from "clsx";

export default function SidePanel() {
  const { selectedWord, sidePanelOpen, setSidePanelOpen, setSelectedWord, wordResult, wordLoading, wordError } =
    useStore();

  function handleClose() {
    setSidePanelOpen(false);
    setSelectedWord(null);
  }

  return (
    <aside
      className={clsx(
        "border-l bg-white flex flex-col transition-all duration-300 overflow-hidden",
        sidePanelOpen ? "w-80 animate-slide-in" : "w-0"
      )}
    >
      {sidePanelOpen && (
        <>
          {/* Panel header */}
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div className="flex items-center gap-2">
              <BookOpen size={16} className="text-blue-600" />
              <span className="text-sm font-semibold">Word Details</span>
            </div>
            <button
              onClick={handleClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Panel body */}
          <div className="flex-1 overflow-y-auto p-5">
            {wordLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-4">
                <Loader2 size={16} className="animate-spin" />
                Looking up <strong>{selectedWord}</strong>...
              </div>
            ) : wordError ? (
              <div className="flex flex-col items-center gap-3 mt-10 text-center">
                <HelpCircle size={36} className="text-red-300" />
                <p className="font-medium text-sm">"{selectedWord}"</p>
                <p className="text-xs text-red-400">{wordError}</p>
              </div>
            ) : wordResult ? (
              <div className="flex flex-col gap-5">
                {/* Word + word class */}
                <div>
                  <div className="flex items-baseline gap-2">
                    {wordResult.word_class && (
                      <span className="text-xs font-medium text-blue-500 uppercase">
                        {wordResult.word_class}
                      </span>
                    )}
                    <h2 className="text-2xl font-bold">{wordResult.word}</h2>
                  </div>
                  <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                    {wordResult.source === "cache" ? "from cache" : "from PONS"}
                  </span>
                </div>

                {/* Meanings */}
                <div className="p-4 rounded-lg bg-blue-50 border border-blue-100">
                  <p className="text-xs text-blue-400 uppercase font-semibold mb-2 tracking-wide">
                    English
                  </p>
                  <ul className="flex flex-col gap-1">
                    {wordResult.english_meanings.map((meaning, i) => (
                      <li key={i} className="text-sm font-medium text-blue-900 flex gap-2">
                        <span className="text-blue-300">{i + 1}.</span>
                        {meaning}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Click any word to see its meaning.
              </p>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
