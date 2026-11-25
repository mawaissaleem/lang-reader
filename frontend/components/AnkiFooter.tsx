import clsx from "clsx";
import React from "react";

type Props = {
  connected: boolean;
  pending: number;
  syncing: boolean;
  message: string | null;
  saveError: string | null;
  saving: boolean;
  saved: boolean;
  canSave: boolean;
  onSave: (anki: boolean) => void;
  onSync: () => void;
  onPull: () => void;
};

/** Bottom of the side panel: Anki status, the Save / Save + Anki buttons and the outbox sync controls. */
export default function AnkiFooter({
  connected,
  pending,
  syncing,
  message,
  saveError,
  saving,
  saved,
  canSave,
  onSave,
  onSync,
  onPull,
}: Props) {
  // safe to read at first render: the panel's body only mounts client-side, after a click
  const [ankiDefault, setAnkiDefault] = React.useState(() => {
    try {
      return localStorage.getItem("ankiDefault") === "1";
    } catch {
      return false;
    }
  });
  function toggleDefault(v: boolean) {
    setAnkiDefault(v);
    try {
      localStorage.setItem("ankiDefault", v ? "1" : "0");
    } catch {}
  }

  return (
    <div className="px-5 py-4 border-t border-line flex-shrink-0">
      <p
        data-testid="anki-status"
        className="flex items-center gap-1.5 text-[11px] text-muted m-0 mb-2"
      >
        <span
          className={clsx(
            "w-1.5 h-1.5 rounded-full",
            connected ? "bg-good" : "bg-faint",
          )}
        />
        {connected ? "Anki connected" : "Anki not connected"}
      </p>
      {saveError && (
        <p className="text-[12px] text-hard m-0 mb-2">{saveError}</p>
      )}
      <div className="flex gap-2">
        {[false, true].map((anki) => {
          const primary = anki === ankiDefault;
          return (
            <button
              key={String(anki)}
              onClick={() => onSave(anki)}
              disabled={saving || saved || !canSave}
              className={clsx(
                "flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-all",
                saved
                  ? "bg-surface-2 text-good border border-line cursor-default"
                  : primary
                    ? "bg-accent text-on-accent hover:brightness-110 disabled:opacity-60"
                    : "bg-accent-soft text-accent border border-line hover:bg-surface-2 disabled:opacity-60",
              )}
            >
              {saving
                ? "Saving…"
                : saved
                  ? "✓ Saved"
                  : anki
                    ? "Save + Anki"
                    : "Save"}
            </button>
          );
        })}
      </div>
      <label className="flex items-center gap-1.5 text-[11px] text-muted mt-2 cursor-pointer">
        <input
          type="checkbox"
          checked={ankiDefault}
          onChange={(e) => toggleDefault(e.target.checked)}
        />
        Make Save + Anki the default
      </label>
      <div className="flex items-center justify-between gap-2 mt-2 text-[11px] text-muted">
        <span data-testid="anki-pending">
          {pending} {pending === 1 ? "card" : "cards"} waiting for Anki
        </span>
        <button
          onClick={onPull}
          disabled={syncing}
          className="px-2 py-1 rounded-lg font-semibold text-accent border border-line hover:bg-accent-soft disabled:opacity-50"
        >
          Pull from Anki
        </button>
        <button
          onClick={onSync}
          disabled={syncing || pending === 0}
          className="px-2 py-1 rounded-lg font-semibold text-accent border border-line hover:bg-accent-soft disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Sync to Anki"}
        </button>
      </div>
      {message && <p className="text-[11px] text-muted m-0 mt-1">{message}</p>}
    </div>
  );
}
