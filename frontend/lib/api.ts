// lib/api.ts

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';


export async function lookupWord(
  word: string,
  userId: number,
  priority?: string,
  force?: boolean,
): Promise<WordLookupResponse> {
  let url = `${API_BASE_URL}/word/${encodeURIComponent(word)}?user_id=${userId}`;
  if (priority) url += `&priority=${encodeURIComponent(priority)}`;
  if (force) url += `&force=true`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `Request failed with status ${response.status}`);
  }

  return response.json();
}

export interface UserWord {
  id: number;
  word: string;
  english_meanings: string[];
  word_class: string | null;
  is_mastered: boolean;
  review_count: number;
  added_at: string;
  source: string | null;
}

export async function fetchUserWords(userId: number): Promise<UserWord[]> {
  const response = await fetch(`${API_BASE_URL}/user/${userId}/words`);
  if (!response.ok) throw new Error("Failed to fetch user words");
  return response.json();
}


export async function saveWord(wordId: number, userId: number, source?: string): Promise<{ message: string; already_saved: boolean }> {
  const response = await fetch(
    `${API_BASE_URL}/user-words/${wordId}/save?user_id=${userId}${source ? `&source=${encodeURIComponent(source)}` : ""}`,
    { method: "POST" }
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `Request failed with status ${response.status}`);
  }
  return response.json();
}

export interface WordLookupResponse {
  id: number;
  source: string; // translator shown: 'pons' | 'libretranslate' | ...
  word: string;
  english_meanings: string[];
  word_class: string | null;
  translations: Record<string, { meanings: string[]; word_class: string | null }>;
  preferred: string;
  errors?: Record<string, string>;
}

export interface LibraryEntry {
  id: number;
  video_id: number | null;
  type: "video" | "text";
  title: string;
  language: string;
  source: "youtube" | "manual";
  created_at: string;
  word_count: number;
  extraction_method: string | null;
}

export async function fetchLibrary(): Promise<LibraryEntry[]> {
  const response = await fetch(`${API_BASE_URL}/library`);
  if (!response.ok) throw new Error(`Failed to fetch library: ${response.status}`);
  return response.json();
}

export async function fetchSubtitleText(subtitleId: number): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/subtitles/${subtitleId}/text`);
  if (!response.ok) throw new Error("Failed to fetch text");
  const data = await response.json();
  return data.text;
}

export async function renameVideo(videoId: number, newTitle: string): Promise<{ id: number; title: string }> {
  const response = await fetch(`${API_BASE_URL}/videos/${videoId}/title`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: newTitle }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed with status ${response.status}`);
  }
  return response.json();
}

export async function createText(title: string, content: string): Promise<LibraryEntry> {
  const response = await fetch(`${API_BASE_URL}/texts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, content }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed with status ${response.status}`);
  }
  return response.json();
}

export async function fetchText(id: number): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/texts/${id}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed with status ${response.status}`);
  }
  return (await response.json()).text;
}

export async function renameText(id: number, newTitle: string): Promise<{ id: number; title: string }> {
  const response = await fetch(`${API_BASE_URL}/texts/${id}/title`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: newTitle }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed with status ${response.status}`);
  }
  return response.json();
}

// Entry ids are per-type (subtitle id vs text id), so type is part of identity.
export const entryKey = (e: LibraryEntry) => `${e.type}-${e.id}`;

export const fetchEntryText = (e: LibraryEntry) =>
  e.type === "text" ? fetchText(e.id) : fetchSubtitleText(e.id);

export const renameEntry = (e: LibraryEntry, title: string) =>
  e.type === "text" ? renameText(e.id, title) : renameVideo(e.video_id as number, title);

export async function importFromYouTube(url: string, title?: string): Promise<LibraryEntry> {
  const body: { url: string; title?: string } = { url };
  if (title !== undefined) body.title = title;
  const response = await fetch(`${API_BASE_URL}/subtitles/german`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed with status ${response.status}`);
  }

  return response.json();
}
