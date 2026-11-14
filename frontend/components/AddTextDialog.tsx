"use client";
import { useState, type CSSProperties, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import useStore from "@/store/useStore";
import { createText, fetchText, importTextFile, importTextUrl, type LibraryEntry } from "@/lib/api";
import { Plus, X } from "lucide-react";

interface AddTextDialogProps {
  triggerLabel?: string;
  triggerStyle?: CSSProperties;
  triggerClassName?: string;
  triggerIcon?: ReactNode;
  onLoadText?: (entry: LibraryEntry) => void;
}

export default function AddTextDialog({
  triggerLabel = "Add Text",
  triggerStyle,
  triggerClassName,
  triggerIcon,
  onLoadText,
}: AddTextDialogProps) {
  const { setText } = useStore();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [input, setInput] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !!(input.trim() || url.trim() || file);

  async function handleSubmit() {
    if (!canSubmit || saving) return;
    setSaving(true);
    setError(null);
    try {
      // imports are saved by the backend as a normal text, so fetch the content back
      const entry = file
        ? await importTextFile(file)
        : url.trim()
          ? await importTextUrl(url.trim())
          : await createText(title.trim(), input.trim());
      const content = file || url.trim() ? await fetchText(entry.id) : input.trim();
      setText(content, entry.title, { kind: "text", id: entry.id });
      onLoadText?.(entry);
      setOpen(false);
      setTitle("");
      setInput("");
      setUrl("");
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save text");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          className={triggerClassName ?? "flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"}
          style={triggerStyle}
        >
          {triggerIcon ?? <Plus size={16} />}
          {triggerLabel}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-2xl rounded-[28px] border border-white/10 bg-[#0e1118] p-6 shadow-[0_30px_120px_rgba(0,0,0,0.35)] text-white">
          <div className="flex items-center justify-between gap-4">
            <Dialog.Title className="text-base font-semibold text-white">
              Paste German Text
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-full p-2 text-slate-400 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="text-sm text-slate-400">
            Paste any German text below. Known words will be highlighted automatically.
          </Dialog.Description>

          {/* Title field */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-200">Title</label>
            <input
              type="text"
              className="w-full rounded-2xl border border-white/10 bg-[#131820] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Der kleine Prinz – Kapitel 1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Text area */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-200">Text</label>
            <textarea
              className="h-56 w-full resize-none rounded-2xl border border-white/10 bg-[#131820] p-4 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Fügen Sie hier Ihren deutschen Text ein..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              autoFocus
            />
          </div>

          {/* Import */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-200">Or import from a URL</label>
              <input
                type="url"
                className="w-full rounded-2xl border border-white/10 bg-[#131820] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-200">Or a PDF / EPUB file</label>
              <input
                type="file"
                accept=".pdf,.epub"
                className="w-full rounded-2xl border border-white/10 bg-[#131820] px-4 py-2.5 text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-slate-200"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex justify-end gap-3">
            <Dialog.Close asChild>
              <button className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5">
                Cancel
              </button>
            </Dialog.Close>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || saving}
              className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : "Load Text"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
