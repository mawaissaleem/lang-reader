"use client";

import useStore from "@/store/useStore";
import { getWordMeaning } from "@/lib/germanWords";
import { X, BookOpen, HelpCircle } from "lucide-react";
import clsx from "clsx";

export default function SidePanel() {
  const { selectedWord, sidePanelOpen, setSidePanelOpen, setSelectedWord } =
    useStore();

  const meaning = selectedWord ? getWordMeaning(selectedWord) : null;

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
            {!selectedWord ? (
              <p className="text-sm text-muted-foreground">
                Click any word to see its meaning.
              </p>
            ) : meaning ? (
              <div className="flex flex-col gap-5">
                {/* Word + gender */}
                <div>
                  <div className="flex items-baseline gap-2">
                    {meaning.gender && (
                      <span className="text-xs font-medium text-blue-500 uppercase">
                        {meaning.gender}
                      </span>
                    )}
                    <h2 className="text-2xl font-bold">{meaning.word}</h2>
                  </div>
                  <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                    {meaning.partOfSpeech}
                  </span>
                </div>

                {/* Translation */}
                <div className="p-4 rounded-lg bg-blue-50 border border-blue-100">
                  <p className="text-xs text-blue-400 uppercase font-semibold mb-1 tracking-wide">
                    English
                  </p>
                  <p className="text-lg font-semibold text-blue-900">
                    {meaning.translation}
                  </p>
                </div>

                {/* Examples */}
                {meaning.examples.length > 0 && (
                  <div>
                    <p className="text-xs uppercase font-semibold text-muted-foreground tracking-wide mb-3">
                      Examples
                    </p>
                    <ul className="flex flex-col gap-3">
                      {meaning.examples.map((ex, i) => (
                        <li
                          key={i}
                          className="p-3 rounded-lg bg-gray-50 border text-sm"
                        >
                          <p className="font-medium text-gray-800">{ex.de}</p>
                          <p className="text-muted-foreground mt-0.5">
                            {ex.en}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              /* No dictionary entry */
              <div className="flex flex-col items-center gap-3 mt-10 text-center">
                <HelpCircle size={36} className="text-gray-300" />
                <p className="font-medium text-sm">
                  "{selectedWord}"
                </p>
                <p className="text-xs text-muted-foreground">
                  No dictionary entry yet. This word will be added when you build out the full dictionary.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
