"use client";
import { useCallback, useEffect, useState } from "react";
import {
  entryKey,
  fetchLibrary,
  fetchLibraryProgress,
  renameEntry,
  type LibraryEntry as Entry,
} from "@/lib/api";
import type { Progress } from "@/lib/progress";

/** Loads the library list and per-entry progress; refreshes progress when `paused` turns false. */
export function useLibraryEntries(paused: boolean) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, Progress>>({});

  // Fetch library on mount
  useEffect(() => {
    fetchLibrary()
      .then((data) => {
        setEntries(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // refetch on returning from the reader: statuses may have changed there
  useEffect(() => {
    if (paused) return;
    fetchLibraryProgress()
      .then(setProgress)
      .catch((err) => console.error("Progress load failed", err));
  }, [paused, entries.length]);

  const rename = useCallback(async (entry: Entry, newTitle: string) => {
    const result = await renameEntry(entry, newTitle);
    setEntries((prev) =>
      prev.map((e) =>
        entryKey(e) === entryKey(entry) ? { ...e, title: result.title } : e,
      ),
    );
  }, []);

  return { entries, setEntries, loading, error, progress, rename };
}
