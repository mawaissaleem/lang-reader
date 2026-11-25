"use client";

import useStore from "@/store/useStore";
import { X, BookOpen, HelpCircle, Loader2, Settings } from "lucide-react";
import clsx from "clsx";
import React from "react";
import type { SelectedToken } from "@/types";
import AiTab from "@/components/AiTab";
import AnkiFooter from "@/components/AnkiFooter";
import InSentenceBox from "@/components/InSentenceBox";
import PlayButton from "@/components/PlayButton";
import SenseList, { SENSE_LIMIT } from "@/components/SenseList";
import SentenceBlock from "@/components/SentenceBlock";
import { useAnkiOutbox } from "@/lib/useAnkiOutbox";

const SOURCES = [
  { id: "pons", label: "PONS" },
  { id: "libretranslate", label: "LibreTranslate" },
  { id: "ai", label: "AI" },
];

// Article colours come from the --gender-* tokens so the themes can swap them.
export const ARTICLE_CLASS = {
  der: "text-[var(--gender-der)]",
  die: "text-[var(--gender-die)]",
  das: "text-[var(--gender-das)]",
};

/** "fängt … an" when the selected words are not neighbours (a separated verb particle), else the clicked text as is. */
export function clickedLabel(clicked: string, tokens: SelectedToken[]) {
  if (tokens.length !== 2) return clicked;
  const [a, b] = tokens.map((t) => Number(t.id.split(":")[1]));
  return b - a > 2 ? tokens.map((t) => t.word).join(" … ") : clicked;
}

export default function SidePanel() {
  const {
    selectedWord,
    sidePanelOpen,
    setSidePanelOpen,
    setSelectedWord,
    wordResult,
    wordLoading,
    wordError,
    wordSaved,
    wordSaving,
    saveError,
    saveSelectedWord,
    translatorPriority,
    setTranslatorPriority,
    activeSource,
    setActiveSource,
    sourceLoading,
    sourceError,
    lookupSource,
    selectedSentence,
    sentenceTranslation,
    sentenceLoading,
    sentenceError,
    title,
    selectedTokens,
    genderColours,
  } = useStore();

  const [showPref, setShowPref] = React.useState(false);
  // the word whose senses are all shown; a new word starts folded again
  const [expandedWord, setExpandedWord] = React.useState<string | null>(null);
  const expanded = !!wordResult && expandedWord === wordResult.word;
  const anki = useAnkiOutbox();
  async function save(withAnki: boolean) {
    await saveSelectedWord(withAnki);
    anki.refreshPending();
  }

  // a source the backend returned but we don't know yet still gets a tab
  const tabs = [
    ...SOURCES,
    ...Object.keys(wordResult?.translations ?? {})
      .filter((id) => !SOURCES.some((s) => s.id === id))
      .map((id) => ({ id, label: id })),
  ];
  const active = activeSource
    ? wordResult?.translations[activeSource]
    : undefined;
  const activeLabel = tabs.find((t) => t.id === activeSource)?.label;

  function handleClose() {
    setSidePanelOpen(false);
    setSelectedWord(null);
  }

  return (
    <aside
      className={clsx(
        "flex flex-col h-full flex-shrink-0 bg-surface transition-all duration-300 overflow-hidden",
        sidePanelOpen ? "w-80 min-w-80 border-l border-line" : "w-0 min-w-0",
      )}
    >
      {sidePanelOpen && (
        <>
          {/* Header */}
          <div className="flex flex-col gap-2 px-5 py-4 border-b border-line flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen size={15} className="text-accent" />
                <span className="text-[13px] font-semibold text-ink tracking-tight">
                  Word Details
                </span>
              </div>
              <button
                onClick={handleClose}
                className="text-faint hover:text-ink transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            {/* Translator preference — open settings to change */}
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold text-muted">
                Preferred translator:
              </div>
              <div className="flex items-center gap-2">
                <div className="text-[12px] font-semibold text-ink uppercase">
                  {translatorPriority === "pons" ? "PONS" : "LibreTranslate"}
                </div>
                <button
                  onClick={() => setShowPref((s) => !s)}
                  className="p-1 rounded hover:bg-surface-2 text-muted"
                  aria-label="Translator settings"
                >
                  <Settings size={14} />
                </button>
              </div>
            </div>

            {showPref && (
              <div className="mt-2 p-3 rounded-lg bg-surface-2">
                <div className="text-[12px] text-ink mb-2">
                  Choose default translator
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setTranslatorPriority("pons");
                      setShowPref(false);
                    }}
                    className={clsx(
                      "flex-1 py-1 rounded-md transition-all tracking-wide uppercase text-[12px] font-semibold",
                      translatorPriority === "pons"
                        ? "bg-accent text-on-accent"
                        : "text-faint hover:text-muted",
                    )}
                  >
                    PONS
                  </button>
                  <button
                    onClick={() => {
                      setTranslatorPriority("libretranslate");
                      setShowPref(false);
                    }}
                    className={clsx(
                      "flex-1 py-1 rounded-md transition-all tracking-wide uppercase text-[12px] font-semibold",
                      translatorPriority === "libretranslate"
                        ? "bg-accent text-on-accent"
                        : "text-faint hover:text-muted",
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
              <div className="flex items-center gap-2 mt-4 text-[13px] text-faint">
                <Loader2 size={15} className="animate-spin" />
                Looking up{" "}
                <strong className="text-muted">{selectedWord}</strong>…
              </div>
            ) : wordError ? (
              <div className="flex flex-col items-center gap-3 mt-10 text-center">
                <HelpCircle size={32} className="text-hard" />
                <p className="text-[14px] font-semibold text-muted m-0">
                  &quot;{selectedWord}&quot;
                </p>
                <p className="text-[12px] text-hard m-0">{wordError}</p>
              </div>
            ) : wordResult ? (
              <div className="flex flex-col gap-5">
                {/* Word + class */}
                <div>
                  <div className="flex items-baseline gap-2 mb-1.5">
                    {active?.word_class && (
                      <span className="text-[10px] font-bold tracking-widest uppercase text-accent">
                        {active.word_class}
                      </span>
                    )}
                    <h2
                      className="text-[26px] font-bold text-ink m-0 leading-tight tracking-tight"
                      style={{
                        fontFamily: "var(--font-dm-serif), Georgia, serif",
                      }}
                    >
                      {wordResult.clicked.toLowerCase() !==
                        wordResult.word.toLowerCase() && (
                        <span className="text-[14px] font-normal text-faint">
                          {clickedLabel(wordResult.clicked, selectedTokens)}{" "}
                          →{" "}
                        </span>
                      )}
                      {wordResult.article && (
                        <span
                          className={
                            genderColours
                              ? ARTICLE_CLASS[wordResult.article]
                              : undefined
                          }
                        >
                          {wordResult.article}{" "}
                        </span>
                      )}
                      {wordResult.word}
                    </h2>
                    {/* says the article too, like the card, so the gender is heard */}
                    <PlayButton
                      key={wordResult.word}
                      text={`${wordResult.article ? wordResult.article + " " : ""}${wordResult.word}`}
                      label="Play pronunciation"
                    />
                  </div>
                </div>

                {activeSource !== "ai" && <InSentenceBox />}

                {/* One tab per source — switching never re-queries */}
                <div role="tablist" className="flex gap-4 border-b border-line">
                  {tabs.map((t) => {
                    const total =
                      wordResult.translations[t.id]?.meanings.length ?? 0;
                    return (
                      <button
                        key={t.id}
                        role="tab"
                        aria-selected={activeSource === t.id}
                        onClick={() => setActiveSource(t.id)}
                        className={clsx(
                          "pb-2 -mb-px text-[11px] font-semibold tracking-widest uppercase border-b-2 transition-colors",
                          activeSource === t.id
                            ? "border-accent text-accent"
                            : "border-transparent text-faint hover:text-muted",
                        )}
                      >
                        {t.label}
                        {total > SENSE_LIMIT && (
                          <span className="ml-1.5 font-normal normal-case tracking-normal text-faint">
                            {expanded ? total : `${SENSE_LIMIT} of ${total}`}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Meanings */}
                {activeSource === "ai" ? (
                  <AiTab />
                ) : active ? (
                  <div
                    role="tabpanel"
                    className="bg-accent-soft border border-line rounded-xl p-4"
                  >
                    <p className="text-[10px] font-bold tracking-widest uppercase text-accent mb-2.5">
                      English
                    </p>
                    <SenseList
                      meanings={active.meanings}
                      expanded={expanded}
                      onToggle={() =>
                        setExpandedWord(expanded ? null : wordResult.word)
                      }
                    />
                  </div>
                ) : (
                  <div
                    role="tabpanel"
                    className="flex flex-col items-center gap-3 py-6 text-center"
                  >
                    <p className="text-[12px] text-faint m-0">
                      No {activeLabel} result for this word yet.
                    </p>
                    {sourceError && (
                      <p className="text-[12px] text-hard m-0">{sourceError}</p>
                    )}
                    <button
                      onClick={() => lookupSource(activeSource as string)}
                      disabled={sourceLoading}
                      className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-accent-soft text-accent border border-line hover:brightness-110 disabled:opacity-60"
                    >
                      {sourceLoading
                        ? "Looking up…"
                        : `Look up in ${activeLabel}`}
                    </button>
                  </div>
                )}

                {/* Sentence in German and English; the AI tab shows its own box */}
                {selectedSentence && activeSource !== "ai" && (
                  <SentenceBlock
                    sentence={selectedSentence}
                    translation={sentenceTranslation}
                    loading={sentenceLoading}
                    error={sentenceError}
                    word={wordResult.word}
                    source={title || "Reader text"}
                    bold={
                      selectedTokens.length
                        ? selectedTokens.map((t) => t.word)
                        : selectedWord
                          ? [selectedWord]
                          : []
                    }
                  />
                )}
              </div>
            ) : (
              <p className="text-[13px] text-faint mt-2">
                Click any word to see its meaning.
              </p>
            )}
          </div>

          <AnkiFooter
            connected={anki.connected}
            pending={anki.pending}
            syncing={anki.syncing}
            message={anki.message}
            saveError={saveError}
            saving={wordSaving}
            saved={wordSaved}
            canSave={!!active}
            onSave={save}
            onSync={anki.sync}
            onPull={anki.pull}
          />
        </>
      )}
    </aside>
  );
}
