"use client";
import { useCallback, useEffect, useState } from "react";
import { fetchProgressHistory } from "@/lib/api";
import type { ProgressHistory } from "@/lib/history";

/** Loads today's count, goal and streak; refetches when `paused` turns false (the reader may have saved words). */
export function useProgressHistory(paused: boolean) {
  const [history, setHistory] = useState<ProgressHistory | null>(null);

  const refresh = useCallback(
    () =>
      fetchProgressHistory()
        .then(setHistory)
        .catch((err) => console.error("Progress history load failed", err)),
    [],
  );

  useEffect(() => {
    if (paused) return;
    refresh();
  }, [paused, refresh]);

  return { history, refresh };
}
