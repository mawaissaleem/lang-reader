export interface Progress { known: number; learning: number; new: number; total: number }

export const knownPct = (p: Progress) => (p.total ? Math.round((p.known / p.total) * 100) : 0);

// "Good level" from 90% known, "Hard" under 75%, nothing between
export const levelTag = (p: Progress): "Good level" | "Hard" | null =>
  !p.total ? null : p.known / p.total >= 0.9 ? "Good level" : p.known / p.total < 0.75 ? "Hard" : null;
