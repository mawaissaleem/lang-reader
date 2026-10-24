import type { WordStatus } from "@/types";

export const STATUS_KEYS: Record<string, WordStatus> = {
  "1": "learning1", "2": "learning2", "3": "learning3", k: "known", i: "ignored",
};

// null when the event is not a status shortcut (typing in a field, modifiers held, other key)
export function statusForKey(e: KeyboardEvent): WordStatus | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const t = e.target as HTMLElement | null;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return null;
  return STATUS_KEYS[e.key.toLowerCase()] ?? null;
}

// literal class strings so Tailwind sees them
export const NEW_CLASS = "bg-blue-500/10 text-blue-200";
export const STATUS_CLASS: Record<WordStatus, { underline: string; highlight: string }> = {
  learning1: { underline: "underline decoration-amber-400 decoration-2 underline-offset-3 text-amber-200", highlight: "bg-amber-400/35 text-amber-100" },
  learning2: { underline: "underline decoration-amber-400/60 decoration-2 underline-offset-3 text-amber-200/90", highlight: "bg-amber-400/20 text-amber-100/90" },
  learning3: { underline: "underline decoration-amber-400/30 decoration-2 underline-offset-3 text-white/80", highlight: "bg-amber-400/10 text-white/80" },
  known: { underline: "text-white/75", highlight: "text-white/75" },
  ignored: { underline: "text-white/30", highlight: "text-white/30" },
};
