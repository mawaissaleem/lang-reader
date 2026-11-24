"use client";
import { useEffect } from "react";
import clsx from "clsx";
import useStore from "@/store/useStore";
import { NEW_CLASS, STATUS_CLASS } from "@/lib/status";
import { TEXT_SIZE_REM } from "@/lib/display";
import type { ReaderTheme } from "@/types";

/** A row of mutually exclusive options; the radio inputs give arrow-key navigation and a focus ring. */
function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; text: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex items-center gap-4"
    >
      <span className="w-28 text-sm text-ink">{label}</span>
      <div className="flex overflow-hidden rounded-lg border border-line">
        {options.map((o) => (
          <label
            key={o.value}
            className={clsx(
              "cursor-pointer px-3 py-1.5 text-[13px] focus-within:ring-2 focus-within:ring-inset focus-within:ring-accent",
              value === o.value
                ? "bg-accent-soft text-ink"
                : "text-muted hover:text-ink",
            )}
          >
            <input
              type="radio"
              name={label}
              className="sr-only"
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            {o.text}
          </label>
        ))}
      </div>
    </div>
  );
}

/** Sample sentence drawn with the real theme tokens of one theme (a new word and a learning word). */
function Preview({ theme }: { theme: ReaderTheme }) {
  const highlightMode = useStore((s) => s.highlightMode);
  const textSize = useStore((s) => s.textSize);
  return (
    <div
      data-theme={theme}
      data-testid={`preview-${theme}`}
      className="flex-1 rounded-lg border border-line bg-bg p-4 font-reading text-ink"
      style={{ fontSize: TEXT_SIZE_REM[textSize] }}
    >
      Der Zug <span className={clsx("rounded px-0.5", NEW_CLASS)}>fängt</span>{" "}
      um acht{" "}
      <span
        className={clsx(
          "rounded px-0.5",
          STATUS_CLASS.learning1[highlightMode],
        )}
      >
        Uhr
      </span>{" "}
      an.
    </div>
  );
}

/** Reading section: the reader's own Display settings (same store and saved value) with a live Dark and Paper preview. */
export default function ReadingSection() {
  const theme = useStore((s) => s.theme);
  const textSize = useStore((s) => s.textSize);
  const highlightMode = useStore((s) => s.highlightMode);
  const setDisplay = useStore((s) => s.setDisplay);
  const loadDisplay = useStore((s) => s.loadDisplay);

  // saved values load after mount, like in the reader
  useEffect(() => loadDisplay(), [loadDisplay]);

  return (
    <div className="flex flex-col gap-4">
      <Choice
        label="Theme"
        value={theme}
        onChange={(v) => setDisplay({ theme: v })}
        options={[
          { value: "dark", text: "Dark" },
          { value: "paper", text: "Paper" },
        ]}
      />
      <Choice
        label="Text size"
        value={textSize}
        onChange={(v) => setDisplay({ textSize: v })}
        options={[
          { value: "S", text: "S" },
          { value: "M", text: "M" },
          { value: "L", text: "L" },
        ]}
      />
      <Choice
        label="Highlights"
        value={highlightMode}
        onChange={(v) => setDisplay({ highlightMode: v })}
        options={[
          { value: "underline", text: "Underline" },
          { value: "highlight", text: "Background" },
        ]}
      />
      <div className="flex flex-col gap-2 sm:flex-row" aria-label="Preview">
        <Preview theme="dark" />
        <Preview theme="paper" />
      </div>
    </div>
  );
}
