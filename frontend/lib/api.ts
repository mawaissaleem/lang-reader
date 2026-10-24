// lib/api.ts

import type { WordStatus } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';


export async function lookupWord(
  word: string,
  userId: number,
  priority?: string,
  force?: boolean,
  sentence?: string | null,
): Promise<WordLookupResponse> {
  let url = `${API_BASE_URL}/word/${encodeURIComponent(word)}?user_id=${userId}`;
  if (priority) url += `&priority=${encodeURIComponent(priority)}`;
  if (force) url += `&force=true`;
  if (sentence) url += `&sentence=${encodeURIComponent(sentence)}`;
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

export async function fetchSentenceTranslation(text: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/sentence?text=${encodeURIComponent(text)}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `Request failed with status ${response.status}`);
  }
  return (await response.json()).translation;
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
  status: WordStatus;
  context_sentence: string | null;
  text_kind: "video" | "text" | null;
  text_id: number | null;
}

export async function fetchUserWords(userId: number): Promise<UserWord[]> {
  const response = await fetch(`${API_BASE_URL}/user/${userId}/words`);
  if (!response.ok) throw new Error("Failed to fetch user words");
  return response.json();
}


// kind uses the library entry "type": video = subtitle id, text = manual text id
export interface SaveContext { context_sentence?: string; text_kind?: "video" | "text"; text_id?: number }

export async function saveWord(wordId: number, userId: number, source?: string, context?: SaveContext, anki = false): Promise<{ message: string; already_saved: boolean; anki_status: "none" | "pending" | "sent" | "failed" }> {
  const response = await fetch(
    `${API_BASE_URL}/user-words/${wordId}/save?user_id=${userId}${source ? `&source=${encodeURIComponent(source)}` : ""}${anki ? "&anki=true" : ""}`,
    context
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(context) }
      : { method: "POST" }
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `Request failed with status ${response.status}`);
  }
  return response.json();
}

export async function patchWordStatus(userWordId: number, status: WordStatus): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/user-words/${userWordId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `Request failed with status ${response.status}`);
  }
}

export interface WordLookupResponse {
  id: number;
  source: string; // translator shown: 'pons' | 'libretranslate' | ...
  word: string; // base form (lemma)
  clicked: string;
  pos: string | null;
  article: "der" | "die" | "das" | null; // nouns only, when spaCy found a gender
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

// A failed request (backend down) counts as "not connected" so the panel never shows an error for it.
export async function fetchAnkiConnected(): Promise<boolean> {
  try {
    const r = await fetch(`${API_BASE_URL}/anki/status`);
    return r.ok && (await r.json()).connected === true;
  } catch {
    return false;
  }
}

export async function fetchAnkiPending(): Promise<number> {
  try {
    const r = await fetch(`${API_BASE_URL}/anki/pending`);
    return r.ok ? (await r.json()).pending : 0;
  } catch {
    return 0;
  }
}

export async function syncAnki(): Promise<{ sent: number; failed: number; pending: number }> {
  const response = await fetch(`${API_BASE_URL}/anki/sync`, { method: "POST" });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed with status ${response.status}`);
  }
  return response.json();
}

export interface AnkiMapping { decks: string[]; model: string; field: string }

async function ankiJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `Request failed with status ${response.status}`);
  }
  return response.json();
}

export async function fetchAnkiOverview(): Promise<{ decks: string[]; models: string[]; mapping: AnkiMapping | null }> {
  return ankiJson(await fetch(`${API_BASE_URL}/anki/overview`));
}

export async function fetchAnkiFields(model: string): Promise<string[]> {
  return ankiJson(await fetch(`${API_BASE_URL}/anki/fields?model=${encodeURIComponent(model)}`));
}

export async function importAnkiKnown(userId: number, mapping: AnkiMapping): Promise<{ imported: number; already_known: number; skipped: number }> {
  return ankiJson(await fetch(`${API_BASE_URL}/anki/import?user_id=${userId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mapping),
  }));
}
