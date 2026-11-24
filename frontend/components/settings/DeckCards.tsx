"use client";
import clsx from "clsx";

/** Anki decks as tickable cards; each card is a real checkbox, so Space ticks it and Tab reaches it. */
export default function DeckCards({
  decks,
  chosen,
  onToggle,
}: {
  decks: string[];
  chosen: string[];
  onToggle: (deck: string) => void;
}) {
  return (
    <fieldset className="grid gap-2 sm:grid-cols-2">
      <legend className="sr-only">Decks to import</legend>
      {decks.map((d) => (
        <label
          key={d}
          className={clsx(
            "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm text-ink",
            "focus-within:ring-2 focus-within:ring-accent",
            chosen.includes(d)
              ? "border-accent bg-accent-soft"
              : "border-line bg-surface-2/40",
          )}
        >
          <input
            type="checkbox"
            checked={chosen.includes(d)}
            onChange={() => onToggle(d)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          {d}
        </label>
      ))}
    </fieldset>
  );
}
