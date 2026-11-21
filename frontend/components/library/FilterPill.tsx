"use client";

/** Pill button used to filter the library by source. */
export default function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        all: "unset",
        cursor: "pointer",
        fontSize: "13px",
        fontWeight: 500,
        padding: "6px 16px",
        borderRadius: "20px",
        border: active
          ? "1px solid rgba(255,255,255,0.25)"
          : "1px solid rgba(255,255,255,0.08)",
        background: active ? "rgba(255,255,255,0.1)" : "transparent",
        color: active ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)",
        transition: "all 0.15s ease",
      }}
    >
      {label}
    </button>
  );
}
