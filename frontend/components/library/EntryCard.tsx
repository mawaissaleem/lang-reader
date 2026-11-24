"use client";
import { useState, useEffect, useRef } from "react";
import type { LibraryEntry as Entry } from "@/lib/api";
import {
  knownPct,
  newPer100,
  type LevelTag,
  type Progress,
} from "@/lib/progress";
import { videoId } from "@/lib/video";
import EntryMenu from "@/components/library/EntryMenu";

const CAPTION_LABELS = { creator: "Creator captions", auto: "Auto captions" };

// literal class strings so Tailwind sees them
const TAG_CLASS: Record<LevelTag, string> = {
  Easiest: "bg-[rgba(62,207,142,0.12)] text-good",
  Stretch: "bg-[rgba(245,166,35,0.12)] text-amber",
  Hardest: "bg-[rgba(255,107,107,0.12)] text-hard",
};

/** Thumbnail of a video, or the first lines of a text. */
function Preview({ entry }: { entry: Entry }) {
  const id = entry.url ? videoId(entry.url) : null;
  if (entry.type === "video") {
    return (
      <div className="relative aspect-video overflow-hidden rounded-xl bg-surface-2">
        {id && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
            alt=""
            className="h-full w-full object-cover"
          />
        )}
      </div>
    );
  }
  return (
    <div className="aspect-video overflow-hidden rounded-xl bg-surface-2 p-4 font-reading text-[15px] leading-relaxed text-muted">
      <p className="line-clamp-4">{entry.preview}</p>
    </div>
  );
}

/** Known / learning / new bar with the difficulty line and relative tag. */
function Difficulty({ progress, tag }: { progress: Progress; tag?: LevelTag }) {
  const pct = (n: number) => `${(n / progress.total) * 100}%`;
  return (
    <div className="mt-3">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="bg-accent" style={{ width: pct(progress.known) }} />
        <div className="bg-amber" style={{ width: pct(progress.learning) }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span>
          <b className="text-ink">{newPer100(progress)}</b> new per 100 words ·{" "}
          {knownPct(progress)}% known
        </span>
        {tag && (
          <span
            className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${TAG_CLASS[tag]}`}
          >
            {tag}
          </span>
        )}
      </div>
    </div>
  );
}

/** One library card: open control, inline rename, difficulty, and a ⋯ menu for rename / mark known / delete. */
export default function EntryCard({
  entry,
  progress,
  tag,
  onOpen,
  onRename,
  onMarkKnown,
  onDelete,
}: {
  entry: Entry;
  progress?: Progress;
  tag?: LevelTag;
  onOpen: () => void;
  onRename: (entry: Entry, newTitle: string) => Promise<void>;
  onMarkKnown: (entry: Entry) => Promise<void>;
  onDelete: (entry: Entry) => Promise<void>;
}) {
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

  // both changes are hard to undo, so they ask first
  const confirmThen = (question: string, run: () => Promise<void>) => () => {
    if (!window.confirm(question)) return;
    run().catch((err) => {
      console.error("Entry action failed:", err);
      window.alert(
        `That did not work: ${err instanceof Error ? err.message : err}`,
      );
    });
  };

  const meta = [
    entry.type === "video" ? "YouTube" : "Pasted text",
    entry.caption_source && CAPTION_LABELS[entry.caption_source],
    `${entry.word_count.toLocaleString()} words`,
  ].filter(Boolean);

  return (
    <article className="relative rounded-2xl border border-line bg-surface p-3.5 transition hover:border-faint">
      {/* Keyboard open control: a sibling of the menu (never its parent), so no button sits inside a button. Mouse clicks on the card land on it too */}
      {!editing && (
        <button
          type="button"
          aria-label={`Open ${entry.title}`}
          onClick={onOpen}
          className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      )}

      <div className="pointer-events-none relative">
        <Preview entry={entry} />
        <div className="pointer-events-auto absolute right-2 top-2">
          <EntryMenu
            actions={[
              {
                label: "Rename",
                onSelect: () => {
                  setDraft(entry.title);
                  setEditing(true);
                },
              },
              {
                label: "Mark all known…",
                onSelect: confirmThen(
                  `Mark every word in "${entry.title}" as known?`,
                  () => onMarkKnown(entry),
                ),
              },
              {
                label: "Delete…",
                danger: true,
                onSelect: confirmThen(`Delete "${entry.title}"?`, () =>
                  onDelete(entry),
                ),
              },
            ]}
          />
        </div>
      </div>

      <p className="pointer-events-none relative mt-3 text-xs text-muted">
        {meta.join(" · ")}
      </p>

      <div className="pointer-events-none relative mt-1">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            disabled={saving}
            aria-label="Title"
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
            className="pointer-events-auto w-full rounded-lg border border-line bg-surface-2 px-2 py-1 font-serif text-xl text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        ) : (
          <h3 className="font-serif text-xl leading-snug text-ink">
            {entry.title}
          </h3>
        )}
      </div>

      {progress && progress.total > 0 && (
        <div className="pointer-events-none relative">
          <Difficulty progress={progress} tag={tag} />
        </div>
      )}
    </article>
  );
}
