import { useCallback, useEffect, useState } from "react";
import useStore from "@/store/useStore";
import {
  fetchAnkiConnected,
  fetchAnkiPending,
  pullAnki,
  syncAnki,
  USER_ID,
} from "@/lib/api";

/** Anki connection status, the count of cards waiting to be sent, and the sync / pull actions with their message. */
export function useAnkiOutbox() {
  const sidePanelOpen = useStore((s) => s.sidePanelOpen);
  const sentenceCards = useStore((s) => s.sentenceCards);
  const loadUserWords = useStore((s) => s.loadUserWords);

  const [connected, setConnected] = useState(false);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // re-check each time the panel opens, so starting Anki is picked up
  useEffect(() => {
    if (sidePanelOpen) fetchAnkiConnected().then(setConnected);
  }, [sidePanelOpen]);

  useEffect(() => {
    if (sidePanelOpen) fetchAnkiPending().then(setPending);
  }, [sidePanelOpen]);

  // a sentence card was added or retried: its state decides whether the count changed
  useEffect(() => {
    fetchAnkiPending().then(setPending);
  }, [sentenceCards]);

  const refreshPending = useCallback(() => {
    fetchAnkiPending().then(setPending);
  }, []);

  /** Runs a sync or pull; `say` shows a message at once, and a thrown error becomes the message. */
  async function run(action: (say: (text: string) => void) => Promise<void>) {
    setSyncing(true);
    setMessage(null);
    try {
      await action(setMessage);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }

  const sync = () =>
    run(async (say) => {
      const r = await syncAnki();
      setPending(r.pending);
      say(`Sent ${r.sent}${r.failed ? `, ${r.failed} rejected by Anki` : ""}`);
    });

  const pull = () =>
    run(async (say) => {
      const r = await pullAnki(USER_ID);
      say(`${r.changed} of ${r.checked} words updated from Anki`);
      // statuses are already saved: a failed reload must not turn the message into an error
      if (r.changed) await loadUserWords(USER_ID).catch(() => {});
    });

  return { connected, pending, syncing, message, refreshPending, sync, pull };
}
