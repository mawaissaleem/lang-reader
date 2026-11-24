"use client";
import clsx from "clsx";

export type Provider = "pons" | "libretranslate";

const LABELS: Record<Provider, { name: string; note: string }> = {
  pons: { name: "PONS", note: "dictionary senses and examples" },
  libretranslate: { name: "LibreTranslate", note: "quick machine translation" },
};

const button =
  "rounded-md border border-line px-2 py-1 text-[13px] text-ink hover:bg-surface-2 aria-disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/** Translator order as a list reordered with the Up / Down buttons or Alt+Arrow keys; the first one opens first. */
export default function TranslatorOrder({
  order,
  onChange,
}: {
  order: Provider[];
  onChange: (order: Provider[]) => void;
}) {
  // swaps an item with its neighbour; moves past either end do nothing
  function move(index: number, by: -1 | 1) {
    const target = index + by;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    if (!e.altKey) return;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      move(index, e.key === "ArrowUp" ? -1 : 1);
    }
  }

  return (
    <ol aria-label="Translator order" className="flex flex-col gap-2">
      {order.map((id, i) => {
        const { name, note } = LABELS[id];
        return (
          <li
            key={id}
            tabIndex={0}
            onKeyDown={(e) => onKeyDown(e, i)}
            aria-label={`${i + 1}. ${name}. Alt plus arrow keys move it.`}
            className={clsx(
              "flex items-center gap-3 rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            )}
          >
            <span className="w-5 text-center text-[12px] text-faint">
              {i + 1}
            </span>
            <span className="font-medium text-ink">{name}</span>
            <span className="flex-1 text-right text-[12px] text-faint">
              {note}
            </span>
            {/* aria-disabled, not disabled: a disabled button drops focus to the page after the move */}
            <button
              type="button"
              className={button}
              aria-disabled={i === 0}
              onClick={() => move(i, -1)}
              aria-label={`Move ${name} up`}
            >
              Up
            </button>
            <button
              type="button"
              className={button}
              aria-disabled={i === order.length - 1}
              onClick={() => move(i, 1)}
              aria-label={`Move ${name} down`}
            >
              Down
            </button>
          </li>
        );
      })}
    </ol>
  );
}
