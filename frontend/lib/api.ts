// lib/api.ts

import type { WordStatus } from "@/types";
import type { ProgressHistory } from "./history";
import type { Cue } from "@/lib/video";

/** Backend base URL, from NEXT_PUBLIC_API_URL. */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** The single user this app serves; every API and store call that needs a user id passes this. */
export const USER_ID = 1;

/**
 * Parses a JSON response, or throws an Error carrying the server's `detail`.
 * `fallback` is the message used when the server sends no detail.
 */
async function readJson<T>(response: Response, fallback?: string): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.detail ||
        fallback ||
        `Request failed with status ${response.status}`,
    );
  }
  return response.json();
}

export const ttsUrl = (text: string) =>
  `${API_BASE_URL}/tts?text=${encodeURIComponent(text)}`;

export async function lookupWord(
  word: string,
  priority?: string,
  force?: boolean,
  sentence?: string | null,
): Promise<WordLookupResponse> {
  const params = new URLSearchParams();
  if (priority) params.set("priority", priority);
  if (force) params.set("force", "true");
  if (sentence) params.set("sentence", sentence);
  const query = params.toString();
  const url = `${API_BASE_URL}/word/${encodeURIComponent(word)}${query ? `?${query}` : ""}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  return readJson(response);
}

export async function fetchSentenceTranslation(text: string): Promise<string> {
  const response = await fetch(
    `${API_BASE_URL}/sentence?text=${encodeURIComponent(text)}`,
  );
  return (await readJson<{ translation: string }>(response)).translation;
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
  return readJson(response, "Failed to fetch user words");
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
  return readJson(response);
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
  // this endpoint returns no body we need; readJson only runs to throw the server's error
  if (!response.ok) await readJson(response);
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
  particle?: string; // verb clicked alone: its separated particle in the sentence (fängt ... an)
  particle_skip?: number; // words with the particle's text between verb and particle (the preposition in "kommt an der Haltestelle an")
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
  /** Who made the captions; null when unknown (older imports) or for texts. */
  caption_source: "creator" | "auto" | null;
  /** Video link (thumbnail source); absent on texts. */
  url?: string;
  /** First characters of a text; absent on videos. */
  preview?: string;
}

export async function fetchLibrary(): Promise<LibraryEntry[]> {
  const response = await fetch(`${API_BASE_URL}/library`);
  return readJson(response, `Failed to fetch library: ${response.status}`);
}

// keyed like entryKey; a text with no readable file is absent
export async function fetchLibraryProgress(): Promise<
  Record<string, Progress>
> {
  const response = await fetch(`${API_BASE_URL}/library/progress`);
  return readJson(response, `Failed to fetch progress: ${response.status}`);
}

export async function fetchSubtitleText(subtitleId: number): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/subtitles/${subtitleId}/text`);
  const data = await readJson<{ text: string }>(
    response,
    "Failed to fetch text",
  );
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
  return readJson(response);
}

async function postText(
  path: string,
  init: RequestInit,
): Promise<LibraryEntry> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    ...init,
  });
  return readJson(response);
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
  return (await readJson<{ text: string }>(response)).text;
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
  return readJson(response);
}

// Entry ids are per-type (subtitle id vs text id), so type is part of identity.
export const entryKey = (e: LibraryEntry) => `${e.type}-${e.id}`;

export const fetchEntryText = (e: LibraryEntry) =>
  e.type === "text" ? fetchText(e.id) : fetchSubtitleText(e.id);

export const renameEntry = (e: LibraryEntry, title: string) =>
  e.type === "text"
    ? renameText(e.id, title)
    : renameVideo(e.video_id as number, title);

// Video entries are addressed by video id, texts by text id (not the subtitle id in entry.id).
const entryPath = (e: LibraryEntry) =>
  `${API_BASE_URL}/library/${e.type}/${e.type === "text" ? e.id : e.video_id}`;

export async function deleteEntry(e: LibraryEntry): Promise<void> {
  await readJson(await fetch(entryPath(e), { method: "DELETE" }));
}

export async function markEntryKnown(
  e: LibraryEntry,
  userId: number,
): Promise<{ changed: number }> {
  return readJson(
    await fetch(`${entryPath(e)}/mark-known?user_id=${userId}`, {
      method: "POST",
    }),
  );
}

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

  return readJson(response);
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
  return readJson(response);
}

export async function pullAnki(
  userId: number,
): Promise<{ changed: number; checked: number }> {
  return readJson(
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
  return readJson(
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

export async function fetchAnkiOverview(): Promise<{
  decks: string[];
  models: string[];
  mapping: AnkiMapping | null;
}> {
  return readJson(await fetch(`${API_BASE_URL}/anki/overview`));
}

export async function fetchAnkiFields(model: string): Promise<string[]> {
  return readJson(
    await fetch(
      `${API_BASE_URL}/anki/fields?model=${encodeURIComponent(model)}`,
    ),
  );
}

export async function importAnkiKnown(
  userId: number,
  mapping: AnkiMapping,
): Promise<{ imported: number; already_known: number; skipped: number }> {
  return readJson(
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
  return readJson(await fetch(`${API_BASE_URL}/llm/models`));
}

export async function saveLlmModel(name: string | null): Promise<void> {
  await readJson(
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
  const r = await readJson<{ models: RunningModel[] }>(
    await fetch(`${API_BASE_URL}/llm/running`),
  );
  return r.models;
}

export async function unloadLlmModel(name: string): Promise<void> {
  await readJson(
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
  // readJson throws the server's error text for a non-2xx response
  if (!response.ok) await readJson(response);
  if (!response.body) {
    throw new Error("The response had no body");
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
  return readJson(response, `Failed to fetch progress: ${response.status}`);
}
