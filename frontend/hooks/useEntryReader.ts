"use client";
import { useCallback, useEffect, useState } from "react";
import {
  fetchEntryText,
  fetchSubtitleCues,
  type LibraryEntry as Entry,
} from "@/lib/api";
import type { Cue } from "@/lib/video";
import useStore from "@/store/useStore";

/** Tracks the open library entry and loads its text (and video cues) into the store. */
export function useEntryReader() {
  const [openEntry, setOpenEntry] = useState<Entry | null>(null);
  const [readerLoading, setReaderLoading] = useState(false);
  const [video, setVideo] = useState<{ url: string; cues: Cue[] } | null>(null);
  const setText = useStore((s) => s.setText);

  const open = useCallback((entry: Entry) => {
    setReaderLoading(true);
    setOpenEntry(entry);
  }, []);
  const close = useCallback(() => setOpenEntry(null), []);

  // When an entry opens, fetch its text and push into store
  useEffect(() => {
    if (!openEntry) return;
    setText("", undefined);
    let stale = false; // a late cues response must not open the next text as the old video
    // timed lines are optional: without them a video opens as plain text
    if (openEntry.type === "video")
      fetchSubtitleCues(openEntry.id)
        .then((v) => !stale && setVideo(v))
        .catch(() => {});
    fetchEntryText(openEntry)
      .then((t) => {
        if (stale) return;
        setText(t, openEntry.title, { kind: openEntry.type, id: openEntry.id });
        setReaderLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load text", err);
        setReaderLoading(false);
      });
    return () => {
      stale = true;
      setVideo(null);
    };
  }, [openEntry, setText]);

  return { openEntry, readerLoading, video, open, close };
}
