"use client";
import { useRef } from "react";
import useStore from "@/store/useStore";
import { THEMES } from "@/lib/display";

/** Three-pill theme radio group for the top bar; arrow keys move and select, and the choice is saved for every page. */
export default function ThemeSwitcher() {
  const theme = useStore((s) => s.theme);
  const setDisplay = useStore((s) => s.setDisplay);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  // arrows select the neighbouring theme (wrapping) and move focus with it
  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[
      e.key
    ];
    if (!step) return;
    e.preventDefault();
    const next = (index + step + THEMES.length) % THEMES.length;
    setDisplay({ theme: THEMES[next].value });
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="flex gap-0.5 rounded-full border border-line bg-surface p-0.5"
    >
      {THEMES.map((t, i) => {
        const on = t.value === theme;
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => setDisplay({ theme: t.value })}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`rounded-full px-3 py-1 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
              on
                ? "bg-[image:var(--grad)] font-semibold text-on-accent"
                : "text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
