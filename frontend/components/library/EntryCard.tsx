"use client";
import { useState, useEffect, useRef } from "react";
import type { LibraryEntry as Entry } from "@/lib/api";
import { knownPct, levelTag, type Progress } from "@/lib/progress";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const CAPTION_LABELS = { creator: "Creator captions", auto: "Auto captions" };

function readingTime(words: number) {
  const mins = Math.ceil(words / 200);
  return `${mins} min read`;
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const YoutubeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.8 15.5V8.5l6.2 3.5-6.2 3.5z" />
  </svg>
);

const PenIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
  </svg>
);

const ArrowIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

// ─── Edit icon ────────────────────────────────────────────────────────────────
const EditIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

// ─── Card ───────────────────────────────────────────────────────────────────
/** One library row: open control, inline rename, and known-word progress. */
export default function EntryCard({
  entry,
  progress,
  onOpen,
  onRename,
}: {
  entry: Entry;
  progress?: Progress;
  onOpen: () => void;
  onRename: (entry: Entry, newTitle: string) => Promise<void>;
}) {
  const isYT = entry.source === "youtube";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.title);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleSave = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === entry.title) {
      setDraft(entry.title);
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onRename(entry, trimmed);
      setEditing(false);
    } catch (err) {
      console.error("Rename failed:", err);
      setDraft(entry.title);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "block", width: "100%" }}>
      <div
        onClick={editing ? undefined : onOpen}
        style={{
          background: "rgba(255,255,255,0.035)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "16px",
          padding: "24px 28px",
          transition: "all 0.2s ease",
          cursor: editing ? "default" : "pointer",
          position: "relative",
          overflow: "hidden",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.background =
            "rgba(255,255,255,0.065)";
          (e.currentTarget as HTMLDivElement).style.borderColor =
            "rgba(255,255,255,0.16)";
          (e.currentTarget as HTMLDivElement).style.transform =
            "translateY(-2px)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.background =
            "rgba(255,255,255,0.035)";
          (e.currentTarget as HTMLDivElement).style.borderColor =
            "rgba(255,255,255,0.08)";
          (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
        }}
      >
        {/* Keyboard open control: a sibling of Rename (never its parent). Its click bubbles to the card, which opens the entry; mouse clicks anywhere on the card do the same */}
        {!editing && (
          <button
            type="button"
            aria-label={`Open ${entry.title}`}
            className="focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white/60"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              border: 0,
              padding: 0,
              background: "transparent",
              borderRadius: "16px",
              cursor: "pointer",
            }}
          />
        )}

        {/* Accent strip */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "3px",
            height: "100%",
            background: isYT
              ? "linear-gradient(180deg, #ff4444, #ff8800)"
              : "linear-gradient(180deg, #4f8eff, #a259ff)",
            borderRadius: "16px 0 0 16px",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "16px",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Source badge */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "10px",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: isYT ? "#ff6644" : "#7b9fff",
                  background: isYT
                    ? "rgba(255,68,68,0.12)"
                    : "rgba(79,142,255,0.12)",
                  padding: "3px 9px",
                  borderRadius: "20px",
                }}
              >
                {isYT ? <YoutubeIcon /> : <PenIcon />}
                {isYT ? "YouTube" : "Manual"}
              </span>
            </div>

            {/* Title — inline editable */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "12px",
              }}
            >
              {editing ? (
                <input
                  ref={inputRef}
                  value={draft}
                  disabled={saving}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSave();
                    }
                    if (e.key === "Escape") {
                      setDraft(entry.title);
                      setEditing(false);
                    }
                  }}
                  onBlur={handleSave}
                  style={{
                    flex: 1,
                    fontSize: "17px",
                    fontWeight: 600,
                    color: "rgba(255,255,255,0.92)",
                    fontFamily: "var(--font-dm-serif), Georgia, serif",
                    letterSpacing: "-0.01em",
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: "8px",
                    padding: "6px 10px",
                    outline: "none",
                    lineHeight: 1.35,
                  }}
                />
              ) : (
                <>
                  <h3
                    style={{
                      fontSize: "17px",
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.92)",
                      margin: 0,
                      lineHeight: 1.35,
                      fontFamily: "var(--font-dm-serif), Georgia, serif",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {entry.title}
                  </h3>
                  <button
                    onClick={(e) => {
                      e.stopPropagation(); // Rename must not open the entry
                      setDraft(entry.title);
                      setEditing(true);
                    }}
                    title="Rename"
                    aria-label="Rename"
                    className="focus-visible:outline-2 focus-visible:outline-white/60"
                    style={{
                      border: 0,
                      padding: 0,
                      background: "transparent",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "26px",
                      height: "26px",
                      borderRadius: "6px",
                      color: "rgba(255,255,255,0.25)",
                      transition: "all 0.15s ease",
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.color =
                        "rgba(255,255,255,0.7)";
                      (e.currentTarget as HTMLButtonElement).style.background =
                        "rgba(255,255,255,0.08)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.color =
                        "rgba(255,255,255,0.25)";
                      (e.currentTarget as HTMLButtonElement).style.background =
                        "transparent";
                    }}
                  >
                    <EditIcon />
                  </button>
                </>
              )}
            </div>

            {/* Meta row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: "12px",
                  color: "rgba(255,255,255,0.35)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatDate(entry.created_at)}
              </span>
              <span
                style={{
                  width: "3px",
                  height: "3px",
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.2)",
                  display: "inline-block",
                }}
              />
              <span
                style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)" }}
              >
                {entry.word_count.toLocaleString()} words
              </span>
              <span
                style={{
                  width: "3px",
                  height: "3px",
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.2)",
                  display: "inline-block",
                }}
              />
              <span
                style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)" }}
              >
                {readingTime(entry.word_count)}
              </span>
              {entry.caption_source && (
                <>
                  <span
                    style={{
                      width: "3px",
                      height: "3px",
                      borderRadius: "50%",
                      background: "rgba(255,255,255,0.2)",
                      display: "inline-block",
                    }}
                  />
                  <span
                    style={{
                      fontSize: "12px",
                      color: "rgba(255,255,255,0.35)",
                    }}
                  >
                    {CAPTION_LABELS[entry.caption_source]}
                  </span>
                </>
              )}
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.5)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginLeft: "2px",
                  background: "rgba(255,255,255,0.06)",
                  padding: "2px 8px",
                  borderRadius: "4px",
                }}
              >
                {entry.language.toUpperCase()}
              </span>
            </div>
            {progress &&
              progress.total > 0 &&
              (() => {
                const tag = levelTag(progress);
                const pct = (n: number) => `${(n / progress.total) * 100}%`;
                return (
                  <div style={{ marginTop: "14px" }}>
                    <div
                      style={{
                        display: "flex",
                        height: "5px",
                        borderRadius: "3px",
                        overflow: "hidden",
                        background: "rgba(255,255,255,0.06)",
                      }}
                    >
                      <div
                        style={{
                          width: pct(progress.known),
                          background: "#4f8eff",
                        }}
                      />
                      <div
                        style={{
                          width: pct(progress.learning),
                          background: "#fbbf24",
                        }}
                      />
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        marginTop: "8px",
                        fontSize: "12px",
                        color: "rgba(255,255,255,0.45)",
                      }}
                    >
                      <span>
                        {knownPct(progress)}% known · {progress.new} new
                      </span>
                      {tag && (
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            padding: "2px 8px",
                            borderRadius: "20px",
                            color: tag === "Hard" ? "#ff8866" : "#7b9fff",
                            background:
                              tag === "Hard"
                                ? "rgba(255,102,68,0.12)"
                                : "rgba(79,142,255,0.12)",
                          }}
                        >
                          {tag}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}
          </div>

          <div
            style={{
              color: "rgba(255,255,255,0.2)",
              paddingTop: "4px",
              flexShrink: 0,
            }}
          >
            <ArrowIcon />
          </div>
        </div>
      </div>
    </div>
  );
}
