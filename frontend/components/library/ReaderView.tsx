"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReaderFooter from "@/components/ReaderFooter";
import SidePanel from "@/components/SidePanel";
import TextDisplay from "@/components/TextDisplay";
import VideoReader from "@/components/VideoReader";
import DisplayMenu from "@/components/library/DisplayMenu";
import PageBar from "@/components/library/PageBar";
import { newForms, splitPages } from "@/lib/pages";
import { TEXT_SIZE_REM } from "@/lib/display";
import useStore from "@/store/useStore";
import type { Cue } from "@/lib/video";

/** Reader screen for one library entry: plain text, or a synced video when timed lines exist. */
export default function ReaderView({
  title,
  loading,
  hasText,
  video,
  captionSource,
  onBack,
}: {
  title: string;
  loading: boolean;
  hasText: boolean;
  video: { url: string; cues: Cue[] } | null;
  captionSource: "creator" | "auto" | null;
  onBack: () => void;
}) {
  const theme = useStore((s) => s.theme);
  const textSize = useStore((s) => s.textSize);
  const loadDisplay = useStore((s) => s.loadDisplay);
  // saved Display settings load after mount so the server and first client render match
  useEffect(() => loadDisplay(), [loadDisplay]);

  // Pages are for typed or imported texts only; videos (even without timed lines) scroll as one.
  const text = useStore((s) => s.text);
  const isText = useStore((s) => s.textRef?.kind === "text");
  const textId = useStore((s) => s.textRef?.id);
  const userWords = useStore((s) => s.userWords);
  const pages = useMemo(() => (isText ? splitPages(text) : []), [isText, text]);
  const [requestedPage, setPage] = useState(0);
  const page = Math.min(requestedPage, Math.max(pages.length - 1, 0));
  const pageText = pages.length ? pages[page] : text;
  const mainRef = useRef<HTMLElement>(null);
  const goToPage = useCallback((next: number) => {
    // token ids restart on every page, so a selection would mark the wrong word
    useStore.getState().setSelectedWord("");
    setPage(next);
    mainRef.current?.scrollTo(0, 0);
  }, []);

  return (
    // Fixed viewport height: the text and the word panel scroll on their own, so the panel's Save bar stays at the screen bottom.
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header
        data-theme={theme}
        className="border-b border-line px-6 py-4 flex items-center gap-3 bg-bg text-ink"
      >
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-muted hover:text-ink transition-colors"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Library
        </button>
        <span className="text-faint">/</span>
        <span className="text-sm font-medium text-ink truncate max-w-md">
          {title}
        </span>
        {/* Auto captions are often wrong, so they get a warning colour; unknown sources show nothing */}
        {captionSource === "auto" && (
          <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-0.5 text-xs text-[var(--warn-text)]">
            Auto captions · may contain errors
          </span>
        )}
        {captionSource === "creator" && (
          <span className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs text-muted">
            Creator captions
          </span>
        )}
        {/* Video view has no text footer, so its word stats live here */}
        {video?.cues.length ? (
          <ReaderFooter
            text={video.cues.map((c) => c.text).join("\n")}
            className="ml-4"
          />
        ) : null}
        {isText && !video?.cues.length && pages.length > 0 ? (
          <PageBar
            key={textId}
            page={page}
            pageCount={pages.length}
            onPage={goToPage}
            newWords={newForms(pageText, userWords)}
          />
        ) : null}
        <DisplayMenu showFocus={!video?.cues.length} />
      </header>

      {/* TextDisplay + SidePanel — exact same structure as root page */}
      <div className="flex flex-1 overflow-hidden">
        <main
          ref={mainRef}
          data-theme={theme}
          style={{ fontSize: TEXT_SIZE_REM[textSize] }}
          className="flex-1 overflow-y-auto p-8 bg-bg text-ink"
        >
          {loading ? (
            <div className="flex items-center justify-center h-full text-muted text-sm">
              Loading text…
            </div>
          ) : !hasText ? (
            <div className="flex items-center justify-center h-full text-muted text-sm">
              No text found for this entry.
            </div>
          ) : video?.cues.length ? (
            <VideoReader url={video.url} cues={video.cues} />
          ) : (
            <TextDisplay pageText={pageText} />
          )}
        </main>
        <SidePanel />
      </div>
    </div>
  );
}
