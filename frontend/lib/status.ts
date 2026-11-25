/** Every word status in display order; the one frontend list (the backend keeps its own in models.py). */
export const STATUSES = [
  "learning1",
  "learning2",
  "learning3",
  "known",
  "ignored",
] as const;
export type WordStatus = (typeof STATUSES)[number];

export const STATUS_HOTKEY: Record<WordStatus, string> = {
  learning1: "1",
  learning2: "2",
  learning3: "3",
  known: "k",
  ignored: "i",
};
export const STATUS_KEYS: Record<string, WordStatus> = Object.fromEntries(
  STATUSES.map((status) => [STATUS_HOTKEY[status], status]),
);

/** False when a key press is a browser shortcut or typing in a field, so a single-letter hotkey must ignore it. */
export function isHotkeyEvent(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const t = e.target as HTMLElement | null;
  return !(
    t &&
    (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
  );
}

// null when the event is not a status shortcut (typing in a field, modifiers held, other key)
export function statusForKey(e: KeyboardEvent): WordStatus | null {
  if (!isHotkeyEvent(e)) return null;
  return STATUS_KEYS[e.key.toLowerCase()] ?? null;
}

// Colours come from the --st-* tokens in globals.css so the themes can swap them.
// Literal class strings so Tailwind sees them.
export const NEW_CLASS = "bg-[var(--st-new-bg)] text-[var(--st-new-text)]";
export const STATUS_CLASS: Record<
  WordStatus,
  { underline: string; highlight: string }
> = {
  learning1: {
    underline:
      "underline decoration-[var(--st-l1-line)] decoration-2 underline-offset-3 text-[var(--st-l1-text)]",
    highlight: "bg-[var(--st-l1-bg)] text-[var(--st-l1-text)]",
  },
  learning2: {
    underline:
      "underline decoration-[var(--st-l2-line)] decoration-2 underline-offset-3 text-[var(--st-l2-text)]",
    highlight: "bg-[var(--st-l2-bg)] text-[var(--st-l2-text)]",
  },
  learning3: {
    underline:
      "underline decoration-[var(--st-l3-line)] decoration-2 underline-offset-3 text-[var(--st-l3-text)]",
    highlight: "bg-[var(--st-l3-bg)] text-[var(--st-l3-text)]",
  },
  known: {
    underline: "text-[var(--st-known-text)]",
    highlight: "text-[var(--st-known-text)]",
  },
  ignored: {
    underline: "text-[var(--st-ignored-text)]",
    highlight: "text-[var(--st-ignored-text)]",
  },
};
