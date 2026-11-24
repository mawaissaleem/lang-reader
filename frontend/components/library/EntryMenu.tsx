"use client";
import { useEffect, useRef, useState } from "react";

export interface MenuAction {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

/** The ⋯ button of a card and its action menu: arrow keys move, Enter/Space picks, Escape closes. */
export default function EntryMenu({ actions }: { actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  // focus the first item when the menu opens
  useEffect(() => {
    if (open) items.current[0]?.focus();
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

  const closeToTrigger = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onMenuKey = (e: React.KeyboardEvent) => {
    const count = actions.length;
    const at = items.current.indexOf(document.activeElement as never);
    const moves: Record<string, number> = {
      ArrowDown: (at + 1) % count,
      ArrowUp: (at - 1 + count) % count,
      Home: 0,
      End: count - 1,
    };
    if (e.key in moves) {
      e.preventDefault();
      items.current[moves[e.key]]?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeToTrigger();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative z-10">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Entry actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-ink hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          onKeyDown={onMenuKey}
          className="absolute right-0 top-9 w-44 rounded-xl border border-line bg-surface p-1 shadow-xl"
        >
          {actions.map((a, i) => (
            <button
              key={a.label}
              ref={(el) => {
                items.current[i] = el;
              }}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                a.onSelect();
              }}
              className={`block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${a.danger ? "text-hard" : "text-ink"}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
