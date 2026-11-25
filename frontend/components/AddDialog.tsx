"use client";
import { useRef, useState, type DragEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { FileText, Link2, Plus, X } from "lucide-react";
import AddPreview from "@/components/library/AddPreview";
import {
  createText,
  fetchEntryText,
  importFromYouTube,
  importTextFile,
  importTextUrl,
  type LibraryEntry,
} from "@/lib/api";
import {
  detectInput,
  normalizeYouTubeUrl,
  type InputKind,
} from "@/lib/detectInput";
import useStore from "@/store/useStore";

const CHIPS: { kind: InputKind; label: string }[] = [
  { kind: "youtube", label: "YouTube video" },
  { kind: "article", label: "Web article" },
  { kind: "text", label: "Pasted text" },
  { kind: "file", label: ".epub · .pdf" },
];

const FIELD =
  "w-full rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

interface Props {
  /** Called once an entry is saved, so the library list can refresh. */
  onSaved: () => void;
  /** Called with the entry to read: the new one, or the existing one for a duplicate. */
  onOpen: (entry: LibraryEntry) => void;
}

/** The one dialog for adding something to read: pasted text, a YouTube or article link, or a dropped file. */
export default function AddDialog({ onSaved, onOpen }: Props) {
  const userWords = useStore((s) => s.userWords);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Links and files are saved before they can be previewed (there is no dry run), so the
  // preview appears here after the import and the button then opens the saved entry.
  const [imported, setImported] = useState<{
    entry: LibraryEntry;
    text: string;
  } | null>(null);
  // Bumped on every reset, so a save still running when the dialog closes drops its result.
  const requestRef = useRef(0);

  const kind = detectInput(input, file);
  const canSubmit = !!(input.trim() || file) && kind !== "unsupported";

  function reset() {
    requestRef.current += 1;
    setBusy(false);
    setInput("");
    setFile(null);
    setTitle("");
    setError(null);
    setImported(null);
  }

  function openEntry(entry: LibraryEntry) {
    setOpen(false);
    reset();
    onOpen(entry);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }

  /** Saves the input by its detected type; the typed title is passed to every route. */
  function save(): Promise<LibraryEntry> {
    const name = title.trim() || undefined;
    if (kind === "file" && file) return importTextFile(file, name);
    if (kind === "youtube")
      return importFromYouTube(normalizeYouTubeUrl(input), name);
    if (kind === "article") return importTextUrl(input.trim(), name);
    return createText(name ?? "", input.trim());
  }

  async function handleSubmit() {
    if (imported) return openEntry(imported.entry);
    if (!canSubmit || busy) return;
    const request = requestRef.current;
    const closed = () => requestRef.current !== request;
    setBusy(true);
    setError(null);
    try {
      const entry = await save();
      // the entry is saved even if the dialog was closed meanwhile, so the library still refreshes
      onSaved();
      if (closed()) return;
      // a repeat add opens the saved entry instead of a copy
      if (entry.duplicate || kind === "text") return openEntry(entry);
      const text = await fetchEntryText(entry);
      if (closed()) return;
      setImported({ entry, text });
    } catch (err) {
      if (closed()) return;
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      if (!closed()) setBusy(false);
    }
  }

  let previewText = "";
  if (imported) previewText = imported.text;
  else if (kind === "text") previewText = input;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Dialog.Trigger asChild>
        <button
          className={`inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-4 py-2 text-[13px] font-semibold text-ink transition hover:brightness-110 ${FOCUS_RING}`}
        >
          <Plus size={16} />
          Add
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        {/* raw black scrim on purpose: a dark backdrop reads as modal in every theme */}
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[90vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-[20px] border border-line bg-surface p-6 text-ink shadow-[0_30px_120px_rgba(0,0,0,0.35)]">
          <div className="flex items-center justify-between gap-4">
            <Dialog.Title className="font-serif text-2xl">
              Add something to read
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className={`rounded-full p-2 text-muted transition-colors hover:text-ink ${FOCUS_RING}`}
            >
              <X size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Paste German text or a link, or drop a file. The detected type is
            shown below.
          </Dialog.Description>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex flex-col gap-2 rounded-2xl border border-dashed p-1 ${
              dragging ? "border-accent bg-accent-soft" : "border-line"
            }`}
          >
            {file ? (
              <div className="flex items-center justify-between gap-3 px-3 py-3 text-sm">
                <span className="flex items-center gap-2">
                  <FileText size={16} className="text-accent" />
                  {file.name}
                </span>
                <button
                  onClick={() => setFile(null)}
                  disabled={!!imported}
                  className={`rounded-lg px-2 py-1 text-muted hover:text-ink disabled:opacity-50 ${FOCUS_RING}`}
                >
                  Remove
                </button>
              </div>
            ) : (
              <textarea
                aria-label="Text, link or file"
                autoFocus
                rows={kind === "text" && input.length > 80 ? 5 : 2}
                value={input}
                disabled={!!imported}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Paste text or a link, or drop a file"
                className={`${FIELD} resize-none border-0 bg-transparent`}
              />
            )}
            {!file && !imported && (
              <label
                className={`flex w-fit cursor-pointer items-center gap-2 rounded-lg px-3 py-1 text-xs text-muted hover:text-ink has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent`}
              >
                <Link2 size={14} />
                Choose a .pdf or .epub file
                <input
                  type="file"
                  accept=".pdf,.epub"
                  className="sr-only"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </div>

          {/* detected type: the active chip shows what the app thinks you gave it */}
          <div className="flex flex-wrap items-center gap-2" aria-live="polite">
            {CHIPS.map((chip) => {
              const active = canSubmit && chip.kind === kind;
              return (
                <span
                  key={chip.kind}
                  aria-current={active || undefined}
                  className={`rounded-md px-2.5 py-1 text-xs ${
                    active
                      ? "bg-accent-soft font-semibold text-accent"
                      : "bg-surface-2 text-muted"
                  }`}
                >
                  {chip.label}
                </span>
              );
            })}
            <span className="text-xs text-faint">← detected automatically</span>
          </div>
          {kind === "unsupported" && (
            <p className="text-xs text-muted">Paste a link to a single video</p>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="add-title" className="text-xs text-muted">
              Title (used in your library)
            </label>
            <input
              id="add-title"
              value={title}
              disabled={!!imported}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Optional: the video title or first words are used"
              className={FIELD}
            />
          </div>

          {previewText && (
            <AddPreview
              text={previewText}
              userWords={userWords}
              captionSource={imported?.entry.caption_source}
            />
          )}

          {error && (
            <p role="alert" className="text-sm text-hard">
              {error}
            </p>
          )}

          <div className="flex items-center justify-between gap-3">
            {imported ? (
              <p className="text-xs text-muted">Saved to your library</p>
            ) : (
              <p className="text-xs text-faint">
                Already in your library? You&apos;ll be taken to it instead of a
                copy.
              </p>
            )}
            <div className="flex gap-3">
              <Dialog.Close
                className={`rounded-2xl border border-line px-4 py-2 text-sm transition hover:bg-surface-2 ${FOCUS_RING}`}
              >
                {imported ? "Close" : "Cancel"}
              </Dialog.Close>
              <button
                onClick={handleSubmit}
                disabled={(!canSubmit && !imported) || busy}
                className={`rounded-2xl bg-[image:var(--grad)] px-4 py-2 text-sm font-semibold text-on-accent transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
              >
                {busy ? "Adding…" : submitLabel(kind, imported?.entry)}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The main button's label: open the saved entry, import a video link, or add. */
function submitLabel(kind: InputKind, saved?: LibraryEntry): string {
  if (saved) return saved.type === "video" ? "Open and watch" : "Open";
  if (kind === "youtube" || kind === "unsupported") return "Import";
  return "Add";
}
