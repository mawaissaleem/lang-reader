"use client";
import SidePanel from "@/components/SidePanel";
import TextDisplay from "@/components/TextDisplay";
import VideoReader from "@/components/VideoReader";
import type { Cue } from "@/lib/video";

/** Reader screen for one library entry: plain text, or a synced video when timed lines exist. */
export default function ReaderView({
  title,
  loading,
  hasText,
  video,
  onBack,
}: {
  title: string;
  loading: boolean;
  hasText: boolean;
  video: { url: string; cues: Cue[] } | null;
  onBack: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-white/[0.06] px-6 py-4 flex items-center gap-3 bg-[#0d0d0f]">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-white/40 hover:text-white/80 transition-colors"
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
        <span className="text-white/10">／</span>
        <span className="text-sm font-medium text-white/60 truncate max-w-md">
          {title}
        </span>
      </header>

      {/* TextDisplay + SidePanel — exact same structure as root page */}
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-8">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              Loading text…
            </div>
          ) : !hasText ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              No text found for this entry.
            </div>
          ) : video?.cues.length ? (
            <VideoReader url={video.url} cues={video.cues} />
          ) : (
            <TextDisplay />
          )}
        </main>
        <SidePanel />
      </div>
    </div>
  );
}
