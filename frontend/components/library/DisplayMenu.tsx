"use client";
import { useEffect, useRef, useState } from "react";
import useStore from "@/store/useStore";
import { isHotkeyEvent } from "@/lib/status";

/** One labelled row of choices; the active choice is marked with aria-pressed. */
function Row<T extends string>({
  label,
  hint,
  value,
  options,
  onPick,
}: {
  label: string;
  hint?: string;
  value: T;
  options: { value: T; label: string }[];
  onPick: (v: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-[13px] text-ink">
      <span>
        {label}
        {hint && (
          <kbd className="ml-2 rounded border border-line px-1 text-[10px] text-muted">
            {hint}
          </kbd>
        )}
      </span>
      <span className="flex overflow-hidden rounded-lg border border-line">
        {options.map((o, i) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onPick(o.value)}
            className={`px-3 py-1 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${i ? "border-l border-line" : ""} ${value === o.value ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2"}`}
          >
            {o.label}
          </button>
        ))}
      </span>
    </div>
  );
}

const ON_OFF = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];

/** The "Aa Display" button and its menu: theme, text size, highlights, gender colours, focus. H and F toggle highlights and focus. */
export default function DisplayMenu({ showFocus }: { showFocus: boolean }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const theme = useStore((s) => s.theme);
  const textSize = useStore((s) => s.textSize);
  const highlightsOn = useStore((s) => s.highlightsOn);
  const highlightMode = useStore((s) => s.highlightMode);
  const genderColours = useStore((s) => s.genderColours);
  const focusMode = useStore((s) => s.focusMode);
  const setDisplay = useStore((s) => s.setDisplay);

  // H / F toggle highlights and focus mode, like the status keys do for words; F is ignored where focus mode does nothing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isHotkeyEvent(e)) return;
      // read fresh state at key time so the listener needs no re-binding
      const now = useStore.getState();
      const key = e.key.toLowerCase();
      if (key === "h") now.setDisplay({ highlightsOn: !now.highlightsOn });
      if (key === "f" && showFocus)
        now.setDisplay({ focusMode: !now.focusMode });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showFocus]);

  // focus the first choice when the menu opens
  useEffect(() => {
    if (open) menuRef.current?.querySelector("button")?.focus();
  }, [open]);

  // a click outside the menu closes it
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <div ref={wrapRef} className="relative ml-auto">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm text-ink hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="font-semibold">Aa</span>
        <span className="text-muted">Display ▾</span>
      </button>
      {open && (
        <div
          ref={menuRef}
          role="dialog"
          aria-label="Display"
          onKeyDown={onMenuKey}
          className="absolute right-0 top-11 z-20 w-80 rounded-xl border border-line bg-surface p-3 shadow-xl"
        >
          <Row
            label="Theme"
            value={theme}
            options={[
              { value: "dark", label: "Dark" },
              { value: "paper", label: "Paper" },
            ]}
            onPick={(theme) => setDisplay({ theme })}
          />
          <Row
            label="Text size"
            value={textSize}
            options={[
              { value: "S", label: "S" },
              { value: "M", label: "M" },
              { value: "L", label: "L" },
            ]}
            onPick={(textSize) => setDisplay({ textSize })}
          />
          <Row
            label="Highlights"
            hint="H"
            value={highlightsOn ? "on" : "off"}
            options={ON_OFF}
            onPick={(v) => setDisplay({ highlightsOn: v === "on" })}
          />
          <Row
            label="Learning words"
            value={highlightMode}
            options={[
              { value: "underline", label: "Underline" },
              { value: "highlight", label: "Highlight" },
            ]}
            onPick={(highlightMode) => setDisplay({ highlightMode })}
          />
          <Row
            label="Gender colours"
            value={genderColours ? "on" : "off"}
            options={ON_OFF}
            onPick={(v) => setDisplay({ genderColours: v === "on" })}
          />
          {showFocus && (
            <Row
              label="Focus mode"
              hint="F"
              value={focusMode ? "on" : "off"}
              options={ON_OFF}
              onPick={(v) => setDisplay({ focusMode: v === "on" })}
            />
          )}
        </div>
      )}
    </div>
  );
}
