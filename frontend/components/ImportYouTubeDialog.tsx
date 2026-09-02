"use client";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { importFromYouTube, fetchLibrary } from "@/lib/api";

interface Props {
  triggerLabel?: string;
  triggerClassName?: string;
  onImported?: (latest: any[]) => void;
}

function normalizeYouTubeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.includes("youtube.com") || parsed.hostname.includes("youtu.be")) {
      const videoId = parsed.searchParams.get("v") || parsed.pathname.split("/").filter(Boolean).at(-1);
      if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
    }
  } catch {
    // fall through to raw trimmed value for non-URL inputs
  }

  return trimmed;
}

export default function ImportYouTubeDialog({ triggerLabel = "Import from YouTube", triggerClassName, onImported }: Props) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const normalizedUrl = normalizeYouTubeUrl(url);
    if (!normalizedUrl) {
      setError("Please enter a YouTube URL");
      return;
    }
    if (!title.trim()) {
      setError("Please enter a title (required)");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const currentLibrary = await fetchLibrary();
      const existing = currentLibrary.find((entry: any) =>
        normalizeYouTubeUrl(entry.url) === normalizedUrl
      );

      if (existing) {
        setError(`This video already exists in your library: ${existing.title || "Untitled"}`);
        return;
      }

      await importFromYouTube(normalizedUrl, title?.trim() || undefined);

      // Poll library for the new entry
      let attempts = 0;
      let found = false;
      while (attempts < 8 && !found) {
        await new Promise((r) => setTimeout(r, 1000));
        const latest = await fetchLibrary();
        if (latest.some((e: any) => e.url === url.trim())) {
          found = true;
          onImported?.(latest);
          break;
        }
        attempts++;
      }

      // Final refresh
      const final = await fetchLibrary();
      onImported?.(final);

      setOpen(false);
      setUrl("");
      setTitle("");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className={triggerClassName ?? "inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-white/10"}>
          {triggerLabel}
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-2xl rounded-[20px] border border-white/10 bg-[#0e1118] p-6 shadow-[0_30px_120px_rgba(0,0,0,0.35)] text-white">
          <div className="flex items-center justify-between gap-4">
            <Dialog.Title className="text-base font-semibold text-white">Import from YouTube</Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-full p-2 text-slate-400 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <Dialog.Description className="text-sm text-slate-400">Paste a YouTube URL and provide a title (required). The backend will fetch subtitles and save them to your library.</Dialog.Description>

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-200">YouTube URL</label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full rounded-2xl border border-white/10 bg-[#131820] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-200">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Custom title to use in library"
                className="w-full rounded-2xl border border-white/10 bg-[#131820] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Future options can go here */}

            {error && <div className="text-sm text-red-400">{error}</div>}

            <div className="flex justify-end gap-3">
              <Dialog.Close asChild>
                <button className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5">Cancel</button>
              </Dialog.Close>
              <button
                onClick={handleSubmit}
                disabled={loading || !title.trim()}
                className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Importing…" : "Import"}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
