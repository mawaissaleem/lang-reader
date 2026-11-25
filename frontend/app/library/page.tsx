"use client";
import { useState, useEffect } from "react";
import { fetchLibrary, entryKey } from "@/lib/api";
import AppNav from "@/components/AppNav";
import AddDialog from "@/components/AddDialog";
import EntryCard from "@/components/library/EntryCard";
import FilterPill from "@/components/library/FilterPill";
import ReaderView from "@/components/library/ReaderView";
import { useEntryReader } from "@/lib/useEntryReader";
import { relativeTags } from "@/lib/progress";
import { sortEntries, upNext, type SortKey } from "@/lib/sortEntries";
import { useProgressHistory } from "@/lib/useProgressHistory";
import TodayStrip from "@/components/library/TodayStrip";
import { useLibraryEntries } from "@/lib/useLibraryEntries";
import useStore from "@/store/useStore";

type Filter = "all" | "youtube" | "manual";
const FILTERS: [Filter, string][] = [
  ["all", "All"],
  ["youtube", "YouTube"],
  ["manual", "Manual"],
];
const SORTS: [SortKey, string][] = [
  ["easiest", "Easiest for me"],
  ["newest", "Newest"],
  ["title", "Title"],
];

export default function LibraryPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const { openEntry, readerLoading, video, open, close } = useEntryReader();
  const [sort, setSort] = useState<SortKey>("easiest");
  const {
    entries,
    setEntries,
    loading,
    error,
    progress,
    rename,
    remove,
    markKnown,
  } = useLibraryEntries(openEntry !== null);

  const { history, refresh: refreshHistory } = useProgressHistory(
    openEntry !== null,
  );
  const next = upNext(entries, progress);

  const text = useStore((s) => s.text);
  const loadUserWords = useStore((s) => s.loadUserWords);
  const loadSettings = useStore((s) => s.loadSettings);
  const loadTranslators = useStore((s) => s.loadTranslators);

  useEffect(() => {
    loadUserWords();
    loadSettings();
    loadTranslators();
  }, [loadUserWords, loadSettings, loadTranslators]);

  const tags = relativeTags(progress);
  const count = (f: Filter) =>
    f === "all" ? entries.length : entries.filter((e) => e.source === f).length;
  const shown = sortEntries(
    entries.filter((e) => filter === "all" || e.source === filter),
    sort,
    progress,
  );

  if (openEntry) {
    return (
      <ReaderView
        title={openEntry.title}
        loading={readerLoading}
        hasText={!!text}
        video={video}
        captionSource={openEntry.caption_source}
        onBack={close}
      />
    );
  }

  return (
    <div>
      <AppNav>
        <AddDialog
          onSaved={() =>
            fetchLibrary()
              .then(setEntries)
              .catch((err) => console.error("Library refresh failed", err))
          }
          onOpen={open}
        />
      </AppNav>

      <main className="mx-auto max-w-[1360px] px-6 pb-20 pt-12">
        <h1 className="mb-1 font-serif text-5xl leading-tight text-ink">
          Library
        </h1>
        <p className="mb-8 text-sm text-muted">
          {loading
            ? "Loading…"
            : `${count("youtube")} videos · ${count("manual")} texts`}
        </p>

        {!loading && !error && (
          <TodayStrip
            history={history}
            next={next}
            nextProgress={next && progress[entryKey(next)]}
            nextLoading={
              entries.length > 0 && Object.keys(progress).length === 0
            }
            onContinue={open}
          />
        )}

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {FILTERS.map(([value, label]) => (
              <FilterPill
                key={value}
                label={`${label} ${count(value)}`}
                active={filter === value}
                onClick={() => setFilter(value)}
              />
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-muted">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {SORTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading && (
          <p className="py-20 text-center text-sm text-faint">
            Loading library…
          </p>
        )}
        {error && (
          <p className="py-20 text-center text-sm text-hard">
            Failed to load: {error}
          </p>
        )}

        {!loading && !error && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((entry) => (
              <EntryCard
                key={entryKey(entry)}
                entry={entry}
                progress={progress[entryKey(entry)]}
                tag={tags[entryKey(entry)]}
                onOpen={() => open(entry)}
                onRename={rename}
                onMarkKnown={async (e) => {
                  await markKnown(e);
                  await Promise.all([loadUserWords(), refreshHistory()]);
                }}
                onDelete={remove}
              />
            ))}
          </div>
        )}

        {!loading && !error && shown.length === 0 && (
          <p className="py-20 text-center text-sm text-faint">
            No entries found.
          </p>
        )}
      </main>
    </div>
  );
}
