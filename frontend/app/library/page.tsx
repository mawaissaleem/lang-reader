"use client";
import { useState, useEffect } from "react";
import { fetchLibrary, entryKey, USER_ID } from "@/lib/api";
import AppNav from "@/components/AppNav";
import AddTextDialog from "@/components/AddTextDialog";
import ImportYouTubeDialog from "@/components/ImportYouTubeDialog";
import EntryCard from "@/components/library/EntryCard";
import FilterPill from "@/components/library/FilterPill";
import ReaderView from "@/components/library/ReaderView";
import { useEntryReader } from "@/lib/useEntryReader";
import { useLibraryEntries } from "@/lib/useLibraryEntries";
import useStore from "@/store/useStore";

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function LibraryPage() {
  const [filter, setFilter] = useState<"all" | "youtube" | "manual">("all");
  const { openEntry, readerLoading, video, open, close } = useEntryReader();
  const { entries, setEntries, loading, error, progress, rename } =
    useLibraryEntries(openEntry !== null);

  const text = useStore((s) => s.text);
  const loadUserWords = useStore((s) => s.loadUserWords);
  const loadTranslatorPriority = useStore((s) => s.loadTranslatorPriority);

  // Load user words once (same as root page)
  useEffect(() => {
    loadUserWords(USER_ID);
    loadTranslatorPriority();
  }, [loadUserWords, loadTranslatorPriority]);

  const filtered = entries.filter((e) =>
    filter === "all" ? true : e.source === filter,
  );

  if (openEntry) {
    return (
      <ReaderView
        title={openEntry.title}
        loading={readerLoading}
        hasText={!!text}
        video={video}
        captionSource={openEntry.caption_source}
        onBack={close}
      />
    );
  }

  // ── Library view ────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0d0d0f",
        color: "rgba(255,255,255,0.85)",
        fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
      }}
    >
      <AppNav>
        <ImportYouTubeDialog
          triggerClassName="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          onImported={(latest) => setEntries(latest)}
        />
        <AddTextDialog
          triggerLabel="Add Text"
          triggerClassName="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          onLoadText={(entry) => {
            open(entry);
            fetchLibrary()
              .then(setEntries)
              .catch((err) => console.error("Library refresh failed", err));
          }}
        />
      </AppNav>

      <main
        style={{
          maxWidth: "860px",
          margin: "0 auto",
          padding: "56px 24px 80px",
        }}
      >
        {/* Page heading */}
        <div style={{ marginBottom: "40px" }}>
          <h1
            style={{
              fontSize: "clamp(32px, 5vw, 48px)",
              fontWeight: 400,
              fontFamily: "var(--font-dm-serif), Georgia, serif",
              letterSpacing: "-0.02em",
              margin: "0 0 10px 0",
              color: "#fff",
              lineHeight: 1.1,
            }}
          >
            Your Library
          </h1>
          <p
            style={{
              fontSize: "14px",
              color: "rgba(255,255,255,0.3)",
              margin: 0,
            }}
          >
            {loading
              ? "Loading…"
              : `${entries.length} texts · intensive reading mode`}
          </p>
        </div>

        {/* Filters + count row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "24px",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", gap: "8px" }}>
            <FilterPill
              label="All"
              active={filter === "all"}
              onClick={() => setFilter("all")}
            />
            <FilterPill
              label="YouTube"
              active={filter === "youtube"}
              onClick={() => setFilter("youtube")}
            />
            <FilterPill
              label="Manual"
              active={filter === "manual"}
              onClick={() => setFilter("manual")}
            />
          </div>
          <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.2)" }}>
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div
          style={{
            height: "1px",
            background: "rgba(255,255,255,0.06)",
            marginBottom: "24px",
          }}
        />

        {/* Entry list */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {loading && (
            <div
              style={{
                textAlign: "center",
                padding: "80px 0",
                color: "rgba(255,255,255,0.2)",
                fontSize: "14px",
              }}
            >
              Loading library…
            </div>
          )}
          {error && (
            <div
              style={{
                textAlign: "center",
                padding: "80px 0",
                color: "#ff6644",
                fontSize: "14px",
              }}
            >
              Failed to load: {error}
            </div>
          )}
          {!loading &&
            !error &&
            filtered.map((entry) => (
              <EntryCard
                key={entryKey(entry)}
                entry={entry}
                progress={progress[entryKey(entry)]}
                onOpen={() => open(entry)}
                onRename={rename}
              />
            ))}
        </div>

        {!loading && !error && filtered.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "80px 0",
              color: "rgba(255,255,255,0.2)",
              fontSize: "14px",
            }}
          >
            No entries found.
          </div>
        )}
      </main>
    </div>
  );
}
