// lib/api.ts

import type { WordStatus } from "@/types";
import type { ProgressHistory } from "./history";
import type { Cue } from "@/lib/video";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const ttsUrl = (text: string) =>
  `${API_BASE_URL}/tts?text=${encodeURIComponent(text)}`;

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
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.detail || `Request failed with status ${response.status}`,
    );
  }

  return response.json();
}

export async function fetchSentenceTranslation(text: string): Promise<string> {
  const response = await fetch(
    `${API_BASE_URL}/sentence?text=${encodeURIComponent(text)}`,
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.detail || `Request failed with status ${response.status}`,
    );
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
export interface SaveContext {
  context_sentence?: string;
  text_kind?: "video" | "text";
  text_id?: number;
}

export async function saveWord(
  wordId: number,
  userId: number,
  source?: string,
  context?: SaveContext,
  anki = false,
): Promise<{
  message: string;
  already_saved: boolean;
  anki_status: "none" | "pending" | "sent" | "failed";
}> {
  const response = await fetch(
    `${API_BASE_URL}/user-words/${wordId}/save?user_id=${userId}${source ? `&source=${encodeURIComponent(source)}` : ""}${anki ? "&anki=true" : ""}`,
    context
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(context),
        }
      : { method: "POST" },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.detail || `Request failed with status ${response.status}`,
    );
  }
  return response.json();
}

export async function patchWordStatus(
  userWordId: number,
  status: WordStatus,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/user-words/${userWordId}/status`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    },
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.detail || `Request failed with status ${response.status}`,
    );
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
  translations: Record<
    string,
    { meanings: string[]; word_class: string | null }
  >;
  preferred: string;
  errors?: Record<string, string>;
}

import type { Progress } from "@/lib/progress";

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
  if (!response.ok)
    throw new Error(`Failed to fetch library: ${response.status}`);
  return response.json();
}

// keyed like entryKey; a text with no readable file is absent
export async function fetchLibraryProgress(): Promise<
  Record<string, Progress>
> {
  const response = await fetch(`${API_BASE_URL}/library/progress`);
  if (!response.ok)
    throw new Error(`Failed to fetch progress: ${response.status}`);
  return response.json();
}

export async function fetchSubtitleText(subtitleId: number): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/subtitles/${subtitleId}/text`);
  if (!response.ok) throw new Error("Failed to fetch text");
  const data = await response.json();
  return data.text;
}

// Timed lines for a video; null when the raw .vtt is gone (the reader then shows plain text)
export async function fetchSubtitleCues(
  subtitleId: number,
): Promise<{ url: string; cues: Cue[] } | null> {
  const response = await fetch(`${API_BASE_URL}/subtitles/${subtitleId}/cues`);
  return response.ok ? response.json() : null;
}

export async function renameVideo(
  videoId: number,
  newTitle: string,
): Promise<{ id: number; title: string }> {
  const response = await fetch(`${API_BASE_URL}/videos/${videoId}/title`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: newTitle }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      err.detail || `Request failed with status ${response.status}`,
    );
  }
  return response.json();
}

async function postText(
  path: string,
  init: RequestInit,
): Promise<LibraryEntry> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    ...init,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      err.detail || `Request failed with status ${response.status}`,
    );
  }
  return response.json();
}

export const createText = (title: string, content: string) =>
  postText("/texts", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, content }),
  });

export const importTextUrl = (url: string) =>
  postText("/texts/import-url", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

export function importTextFile(file: File) {
  const body = new FormData();
  body.append("file", file);
  return postText("/texts/import-file", { body });
}

export async function fetchText(id: number): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/texts/${id}`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      err.detail || `Request failed with status ${response.status}`,
    );
  }
  return (await response.json()).text;
}

export async function renameText(
  id: number,
  newTitle: string,
): Promise<{ id: number; title: string }> {
  const response = await fetch(`${API_BASE_URL}/texts/${id}/title`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: newTitle }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      err.detail || `Request failed with status ${response.status}`,
    );
  }
  return response.json();
}

// Entry ids are per-type (subtitle id vs text id), so type is part of identity.
export const entryKey = (e: LibraryEntry) => `${e.type}-${e.id}`;

export const fetchEntryText = (e: LibraryEntry) =>
  e.type === "text" ? fetchText(e.id) : fetchSubtitleText(e.id);

export const renameEntry = (e: LibraryEntry, title: string) =>
  e.type === "text"
    ? renameText(e.id, title)
    : renameVideo(e.video_id as number, title);

export async function importFromYouTube(
  url: string,
  title?: string,
): Promise<LibraryEntry> {
  const body: { url: string; title?: string } = { url };
  if (title !== undefined) body.title = title;
  const response = await fetch(`${API_BASE_URL}/subtitles/german`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      err.detail || `Request failed with status ${response.status}`,
    );
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

export async function syncAnki(): Promise<{
  sent: number;
  failed: number;
  pending: number;
}> {
  const response = await fetch(`${API_BASE_URL}/anki/sync`, { method: "POST" });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      err.detail || `Request failed with status ${response.status}`,
    );
  }
  return response.json();
}

export async function pullAnki(
  userId: number,
): Promise<{ changed: number; checked: number }> {
  return ankiJson(
    await fetch(`${API_BASE_URL}/anki/pull?user_id=${userId}`, {
      method: "POST",
    }),
  );
}

export interface SentenceCard {
  sentence_de: string;
  sentence_en: string;
  target_word: string;
  source: string;
  bold?: string[];
}

export async function addSentenceCard(
  userId: number,
  card: SentenceCard,
): Promise<{ anki_status: "pending" | "sent" | "failed"; pending: number }> {
  return ankiJson(
    await fetch(`${API_BASE_URL}/anki/sentences?user_id=${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card),
    }),
  );
}

export interface AnkiMapping {
  decks: string[];
  model: string;
  field: string;
}

async function ankiJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      err.detail || `Request failed with status ${response.status}`,
    );
  }
  return response.json();
}

export async function fetchAnkiOverview(): Promise<{
  decks: string[];
  models: string[];
  mapping: AnkiMapping | null;
}> {
  return ankiJson(await fetch(`${API_BASE_URL}/anki/overview`));
}

export async function fetchAnkiFields(model: string): Promise<string[]> {
  return ankiJson(
    await fetch(
      `${API_BASE_URL}/anki/fields?model=${encodeURIComponent(model)}`,
    ),
  );
}

export async function importAnkiKnown(
  userId: number,
  mapping: AnkiMapping,
): Promise<{ imported: number; already_known: number; skipped: number }> {
  return ankiJson(
    await fetch(`${API_BASE_URL}/anki/import?user_id=${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mapping),
    }),
  );
}

export interface LlmModels {
  models: { name: string; size: number }[];
  selected: string | null;
  default: string | null;
}

export async function fetchLlmModels(): Promise<LlmModels> {
  return ankiJson(await fetch(`${API_BASE_URL}/llm/models`));
}

export async function saveLlmModel(name: string | null): Promise<void> {
  await ankiJson(
    await fetch(`${API_BASE_URL}/llm/model`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  );
}

export interface RunningModel {
  name: string;
  expires_at: string | null;
}

export async function fetchRunningModels(): Promise<RunningModel[]> {
  const r = await ankiJson<{ models: RunningModel[] }>(
    await fetch(`${API_BASE_URL}/llm/running`),
  );
  return r.models;
}

export async function unloadLlmModel(name: string): Promise<void> {
  await ankiJson(
    await fetch(`${API_BASE_URL}/llm/unload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  );
}

/** "unloads in 3 min" for an Ollama expires_at; Ollama uses a far-future date for keep-alive -1. */
export function unloadsIn(expiresAt: string | null, now = Date.now()): string {
  const ms = expiresAt ? Date.parse(expiresAt) - now : NaN;
  if (Number.isNaN(ms)) return "";
  if (ms > 24 * 3600e3) return "stays loaded";
  if (ms < 60e3) return "unloads in under a minute";
  return `unloads in ${Math.round(ms / 60e3)} min`;
}

export interface AiExample {
  de: string;
  en: string;
}
export interface AiResult {
  lemma: string;
  pos: string;
  article: string | null;
  plural: string | null;
  meaning_in_context: string;
  sentence_translation: string;
  examples: AiExample[];
  note: string | null;
}
export interface AiAnswer {
  result: AiResult;
  model: string;
  cached: boolean;
}

// Streams /word/{word}/ai (NDJSON): onToken per token line, onRetry when the backend restarts after invalid JSON.
// Resolves with the final result line, throws the error line's message.
export async function fetchAiAnswer(
  word: string,
  sentence: string,
  {
    onToken,
    onRetry,
    signal,
  }: { onToken?: () => void; onRetry?: () => void; signal?: AbortSignal } = {},
): Promise<AiAnswer> {
  const response = await fetch(
    `${API_BASE_URL}/word/${encodeURIComponent(word)}/ai?sentence=${encodeURIComponent(sentence)}`,
    { signal },
  );
  if (!response.ok || !response.body) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.detail || `Request failed with status ${response.status}`,
    );
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let answer: AiAnswer | null = null;
  const handle = (raw: string) => {
    if (!raw.trim()) return;
    const msg = JSON.parse(raw);
    if (msg.error) throw new Error(msg.error);
    if (msg.result)
      answer = { result: msg.result, model: msg.model, cached: !!msg.cached };
    else if (msg.retry) onRetry?.();
    else if ("token" in msg) onToken?.();
  };
  for (;;) {
    const { done, value } = await reader.read();
    buf += decoder.decode(value, { stream: !done });
    const lines = buf.split("\n");
    buf = lines.pop() ?? ""; // a partial last line waits for the next chunk
    lines.forEach(handle);
    if (done) break;
  }
  handle(buf);
  if (!answer) throw new Error("The answer ended without a result");
  return answer;
}

export async function fetchProgressHistory(
  userId: number,
): Promise<ProgressHistory> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const response = await fetch(
    `${API_BASE_URL}/progress?user_id=${userId}&tz=${encodeURIComponent(tz)}`,
  );
  if (!response.ok)
    throw new Error(`Failed to fetch progress: ${response.status}`);
  return response.json();
}
