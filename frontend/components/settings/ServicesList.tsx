"use client";
import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import {
  fetchAnkiConnected,
  fetchAnkiPending,
  fetchServicesStatus,
  syncAnki,
  ttsUrl,
  type ServiceStatus,
} from "@/lib/api";

interface Row {
  id: string;
  name: string;
  action: string;
  run: () => Promise<string | void>;
}

const BACKEND_DOWN: ServiceStatus = {
  ok: false,
  detail: "Could not check: the app's backend is not reachable",
};

/** Services section: a status dot, a plain-words detail and one action for each service the app uses. */
export default function ServicesList() {
  const [state, setState] = useState<Record<string, ServiceStatus>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const setNote = (id: string, note: string) =>
    setNotes((n) => ({ ...n, [id]: note }));

  const check = useCallback(() => loadStatuses().then(setState), []);

  useEffect(() => {
    check();
  }, [check]);

  // a recheck often changes nothing on screen, so the note confirms it ran
  const recheck = (id: string) => async () => {
    setNote(id, "Checking…");
    await check();
    return "Checked just now";
  };

  const rows: Row[] = [
    {
      id: "pons",
      name: "PONS dictionary",
      action: "Recheck",
      run: recheck("pons"),
    },
    {
      id: "libretranslate",
      name: "LibreTranslate",
      action: "Test",
      run: recheck("libretranslate"),
    },
    {
      id: "ollama",
      name: "Local AI (Ollama)",
      action: "Choose model",
      run: async () => {
        const picker = document.getElementById("ai-model");
        // focus alone does not scroll to the picker while it is disabled (Ollama down)
        picker?.scrollIntoView({ block: "center" });
        picker?.focus();
      },
    },
    {
      id: "anki",
      name: "Anki",
      action: "Sync now",
      run: async () => {
        const { sent, failed, pending } = await syncAnki();
        await check(); // the "cards waiting" count drops after a sync
        const failedNote = failed ? `, ${failed} failed` : "";
        const pendingNote = pending > 0 ? `, ${pending} still waiting` : "";
        return `Sent ${sent} cards${failedNote}${pendingNote}`;
      },
    },
    {
      id: "piper",
      name: "Audio (Piper)",
      action: "Play sample",
      run: async () => {
        await new Audio(ttsUrl("Guten Tag")).play();
      },
    },
  ];

  async function act(row: Row) {
    setNote(row.id, "");
    try {
      const note = await row.run();
      if (note) setNote(row.id, note);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      setNote(row.id, `${row.action} failed: ${msg}`);
    }
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => {
        const status = state[row.id];
        const detail = status?.detail ?? "Checking…";
        return (
          <li
            key={row.id}
            data-testid={`service-${row.id}`}
            data-state={!status ? "checking" : status.ok ? "up" : "down"}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-line bg-surface-2/40 px-4 py-3"
          >
            <span
              aria-hidden
              className={clsx(
                "h-2.5 w-2.5 flex-none rounded-full",
                !status && "bg-faint",
                status?.ok && "bg-good",
                status && !status.ok && "bg-hard",
              )}
            />
            <span className="w-44 flex-none text-sm font-medium text-ink">
              {row.name}
              <span className="sr-only">
                {status ? (status.ok ? ", working" : ", not working") : ""}
              </span>
            </span>
            <span className="min-w-48 flex-1 text-[13px] text-muted">
              {detail}
              {notes[row.id] && (
                <span role="status" className="block text-faint">
                  {notes[row.id]}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => act(row)}
              className="rounded-md border border-line px-3 py-1 text-[13px] text-ink hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {row.action}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Anki's state from its existing connection and outbox endpoints. */
async function ankiStatus(): Promise<ServiceStatus> {
  if (!(await fetchAnkiConnected())) {
    return {
      ok: false,
      detail: "Anki is not running. Open Anki with the AnkiConnect add-on",
    };
  }
  const waiting = await fetchAnkiPending();
  return { ok: true, detail: `Connected · ${waiting} cards waiting` };
}

/** Every row's state: the new status endpoint for four services, the Anki endpoints for the fifth. */
async function loadStatuses(): Promise<Record<string, ServiceStatus>> {
  const [services, anki] = await Promise.all([
    fetchServicesStatus().catch(() => null),
    ankiStatus(),
  ]);
  const next: Record<string, ServiceStatus> = { anki };
  for (const id of ["pons", "libretranslate", "ollama", "piper"] as const) {
    next[id] = services ? services[id] : BACKEND_DOWN;
  }
  return next;
}
