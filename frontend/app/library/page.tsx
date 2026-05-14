
"use client";
import { useState, useEffect } from "react";

const API_BASE = "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Entry {
  id: number;
  type: "video" | "text";
  title: string;
  language: string;
  source: "youtube" | "manual";
  created_at: string;
  word_count: number;
  extraction_method: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function readingTime(words: number) {
  const mins = Math.ceil(words / 200);
  return `${mins} min read`;
}

// ─── Icons (inline SVG — no extra dep) ───────────────────────────────────────
const YoutubeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.8 15.5V8.5l6.2 3.5-6.2 3.5z"/>
  </svg>
);

const PenIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
  </svg>
);

const ArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7"/>
  </svg>
);

// ─── Card ─────────────────────────────────────────────────────────────────────
function EntryCard({ entry, onClick }: { entry: Entry; onClick: () => void }) {
  const isYT = entry.source === "youtube";

  return (
    <button
      onClick={onClick}
      className="group relative w-full text-left"
      style={{ all: "unset", display: "block", cursor: "pointer", width: "100%" }}
    >
      <div
        style={{
          background: "rgba(255,255,255,0.035)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "16px",
          padding: "24px 28px",
          transition: "all 0.2s ease",
          position: "relative",
          overflow: "hidden",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.065)";
          (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.16)";
          (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.035)";
          (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.08)";
          (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
        }}
      >
        {/* Accent strip */}
        <div style={{
          position: "absolute",
          top: 0, left: 0,
          width: "3px", height: "100%",
          background: isYT
            ? "linear-gradient(180deg, #ff4444, #ff8800)"
            : "linear-gradient(180deg, #4f8eff, #a259ff)",
          borderRadius: "16px 0 0 16px",
        }} />

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
          {/* Left */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Source badge */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: isYT ? "#ff6644" : "#7b9fff",
                background: isYT ? "rgba(255,68,68,0.12)" : "rgba(79,142,255,0.12)",
                padding: "3px 9px",
                borderRadius: "20px",
              }}>
                {isYT ? <YoutubeIcon /> : <PenIcon />}
                {isYT ? "YouTube" : "Manual"}
              </span>
              {entry.extraction_method && (
                <span style={{
                  fontSize: "10px",
                  color: "rgba(255,255,255,0.3)",
                  fontFamily: "monospace",
                  background: "rgba(255,255,255,0.05)",
                  padding: "2px 7px",
                  borderRadius: "4px",
                }}>
                  {entry.extraction_method}
                </span>
              )}
            </div>

            {/* Title */}
            <h3 style={{
              fontSize: "17px",
              fontWeight: 600,
              color: "rgba(255,255,255,0.92)",
              margin: "0 0 12px 0",
              lineHeight: 1.35,
              fontFamily: "'DM Serif Display', Georgia, serif",
              letterSpacing: "-0.01em",
            }}>
              {entry.title}
            </h3>

            {/* Meta row */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)", fontVariantNumeric: "tabular-nums" }}>
                {formatDate(entry.created_at)}
              </span>
              <span style={{ width: "3px", height: "3px", borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "inline-block" }} />
              <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)" }}>
                {entry.word_count.toLocaleString()} words
              </span>
              <span style={{ width: "3px", height: "3px", borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "inline-block" }} />
              <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)" }}>
                {readingTime(entry.word_count)}
              </span>
              <span style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "rgba(255,255,255,0.5)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginLeft: "2px",
                background: "rgba(255,255,255,0.06)",
                padding: "2px 8px",
                borderRadius: "4px",
              }}>
                {entry.language.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Arrow */}
          <div style={{
            color: "rgba(255,255,255,0.2)",
            transition: "all 0.2s",
            paddingTop: "4px",
            flexShrink: 0,
          }}
            className="card-arrow"
          >
            <ArrowIcon />
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Filter pill ──────────────────────────────────────────────────────────────
function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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
        border: active ? "1px solid rgba(255,255,255,0.25)" : "1px solid rgba(255,255,255,0.08)",
        background: active ? "rgba(255,255,255,0.1)" : "transparent",
        color: active ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.35)",
        transition: "all 0.15s ease",
      }}
    >
      {label}
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function LibraryPage() {
  const [filter, setFilter] = useState<"all" | "youtube" | "manual">("all");
  const [openEntry, setOpenEntry] = useState<Entry | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/library`)
      .then(res => {
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        return res.json();
      })
      .then((data: Entry[]) => {
        setEntries(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const filtered = entries.filter(e =>
    filter === "all" ? true : e.source === filter
  );

  // ── Reader modal ────────────────────────────────────────────────────────────
  if (openEntry) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#0d0d0f",
        color: "rgba(255,255,255,0.85)",
      }}>
        {/* Reader topbar */}
        <div style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "rgba(13,13,15,0.85)",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          padding: "14px 32px",
          display: "flex",
          alignItems: "center",
          gap: "16px",
        }}>
          <button
            onClick={() => setOpenEntry(null)}
            style={{
              all: "unset",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "13px",
              color: "rgba(255,255,255,0.4)",
              transition: "color 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.8)")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Library
          </button>
          <span style={{ color: "rgba(255,255,255,0.1)" }}>／</span>
          <span style={{
            fontSize: "14px",
            color: "rgba(255,255,255,0.6)",
            fontFamily: "'DM Serif Display', Georgia, serif",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {openEntry.title}
          </span>
        </div>

        {/* Reader content — your TextDisplay goes here */}
        <div style={{ padding: "48px 24px" }}>
          {/*
            Replace this placeholder with your actual <TextDisplay /> component.
            You'll need to load the text into your store before rendering.
            e.g. useEffect(() => store.setText(fetchedText), [openEntry.id])
          */}
          <div style={{
            maxWidth: "720px",
            margin: "0 auto",
            fontFamily: "Georgia, serif",
            fontSize: "1.1rem",
            lineHeight: 1.9,
            color: "rgba(255,255,255,0.75)",
          }}>
            {/* <TextDisplay /> */}
            <p style={{ color: "rgba(255,255,255,0.3)", fontStyle: "italic", textAlign: "center", marginTop: "80px" }}>
              Plug your &lt;TextDisplay /&gt; component here.<br />
              Load <code style={{ background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: "4px" }}>openEntry.id</code> → fetch text → set store → render.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Library view ────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh",
      background: "#0d0d0f",
      color: "rgba(255,255,255,0.85)",
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Serif+Display&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
      `}</style>

      {/* Top nav */}
      <header style={{
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "18px 40px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{
          fontSize: "18px",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          fontFamily: "'DM Serif Display', Georgia, serif",
          color: "#fff",
        }}>
          leseraum
          <span style={{ color: "rgba(255,255,255,0.2)", fontWeight: 400 }}>.de</span>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {["Library", "Vocabulary", "Stats"].map(item => (
            <button key={item} style={{
              all: "unset",
              cursor: "pointer",
              fontSize: "13px",
              color: item === "Library" ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.3)",
              padding: "6px 14px",
              borderRadius: "8px",
              background: item === "Library" ? "rgba(255,255,255,0.07)" : "transparent",
              transition: "all 0.15s",
            }}>
              {item}
            </button>
          ))}
        </div>
      </header>

      <main style={{ maxWidth: "860px", margin: "0 auto", padding: "56px 24px 80px" }}>
        {/* Page heading */}
        <div style={{ marginBottom: "40px" }}>
          <h1 style={{
            fontSize: "clamp(32px, 5vw, 48px)",
            fontWeight: 400,
            fontFamily: "'DM Serif Display', Georgia, serif",
            letterSpacing: "-0.02em",
            margin: "0 0 10px 0",
            color: "#fff",
            lineHeight: 1.1,
          }}>
            Your Library
          </h1>
          <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.3)", margin: 0 }}>
            {loading ? "Loading…" : `${entries.length} texts · intensive reading mode`}
          </p>
        </div>

        {/* Filters + count row */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "24px",
          flexWrap: "wrap",
          gap: "12px",
        }}>
          <div style={{ display: "flex", gap: "8px" }}>
            <FilterPill label="All" active={filter === "all"} onClick={() => setFilter("all")} />
            <FilterPill label="YouTube" active={filter === "youtube"} onClick={() => setFilter("youtube")} />
            <FilterPill label="Manual" active={filter === "manual"} onClick={() => setFilter("manual")} />
          </div>
          <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.2)" }}>
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Divider */}
        <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", marginBottom: "24px" }} />

        {/* Entry list */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {loading && (
            <div style={{ textAlign: "center", padding: "80px 0", color: "rgba(255,255,255,0.2)", fontSize: "14px" }}>
              Loading library…
            </div>
          )}
          {error && (
            <div style={{ textAlign: "center", padding: "80px 0", color: "#ff6644", fontSize: "14px" }}>
              Failed to load: {error}
            </div>
          )}
          {!loading && !error && filtered.map(entry => (
            <EntryCard
              key={entry.id}
              entry={entry}
              onClick={() => setOpenEntry(entry)}
            />
          ))}
        </div>

        {!loading && !error && filtered.length === 0 && (
          <div style={{
            textAlign: "center",
            padding: "80px 0",
            color: "rgba(255,255,255,0.2)",
            fontSize: "14px",
          }}>
            No entries found.
          </div>
        )}
      </main>
    </div>
  );
}
