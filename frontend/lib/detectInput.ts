/** What the Add dialog thinks the user gave it; "unsupported" is a YouTube link that is not one video. */
export type InputKind = "youtube" | "article" | "text" | "file" | "unsupported";

const VIDEO_PATHS = /^\/(?:shorts|embed|live)\/([\w-]+)/;

/** The single http(s) URL in `value`, or null when it has other words around it (then it is pasted text). */
function asUrl(value: string): URL | null {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** "youtube.com" or "youtu.be" for a YouTube link (any subdomain we know), otherwise the bare host. */
function youtubeHost(url: URL): string {
  return url.hostname.replace(/^(www|m|music)\./, "");
}

/** The video id of a YouTube link (watch?v=, youtu.be, shorts, embed, live), or null for any other URL. */
function youtubeId(url: URL): string | null {
  const host = youtubeHost(url);
  if (host === "youtu.be") return url.pathname.split("/")[1] || null;
  if (host !== "youtube.com") return null;
  if (url.pathname === "/watch") return url.searchParams.get("v");
  return VIDEO_PATHS.exec(url.pathname)?.[1] ?? null;
}

/** Canonical watch URL for a YouTube link; other input comes back trimmed. */
export function normalizeYouTubeUrl(value: string): string {
  const url = asUrl(value);
  const id = url && youtubeId(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : value.trim();
}

/** A dropped or chosen file wins; otherwise a lone link is a video or article and anything else is pasted text. */
export function detectInput(text: string, file?: File | null): InputKind {
  if (file) return "file";
  const url = asUrl(text);
  if (!url) return "text";
  if (youtubeId(url)) return "youtube";
  // a channel or playlist page holds no article text, and only single videos can be imported
  const host = youtubeHost(url);
  if (host === "youtube.com" || host === "youtu.be") return "unsupported";
  return "article";
}
