import React from "react";

export const SENSE_LIMIT = 3;

type Props = {
  meanings: string[];
  expanded: boolean;
  onToggle: () => void;
};

/** The first few dictionary senses, with a toggle that reveals the rest. */
export default function SenseList({ meanings, expanded, onToggle }: Props) {
  const shown = expanded ? meanings : meanings.slice(0, SENSE_LIMIT);
  const hidden = meanings.length - SENSE_LIMIT;
  return (
    <div>
      <ul className="flex flex-col gap-1.5 m-0 p-0 list-none">
        {shown.map((meaning, i) => (
          <li
            key={i}
            className="flex gap-2 text-[13px] text-white/75 leading-relaxed"
          >
            <span className="text-blue-400/50 tabular-nums flex-shrink-0">
              {i + 1}.
            </span>
            {meaning}
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          onClick={onToggle}
          aria-expanded={expanded}
          className="mt-2.5 text-[12px] font-semibold text-blue-400 rounded hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          {expanded
            ? "Show fewer senses ▴"
            : `Show ${hidden} more ${hidden === 1 ? "sense" : "senses"} ▾`}
        </button>
      )}
    </div>
  );
}
