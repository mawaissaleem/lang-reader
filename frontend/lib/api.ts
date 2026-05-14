// lib/api.ts

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';


export async function lookupWord(word: string, userId: number): Promise<WordLookupResponse> {
  const response = await fetch(
    `${API_BASE_URL}/word/${encodeURIComponent(word)}?user_id=${userId}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
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
}

export async function fetchUserWords(userId: number): Promise<UserWord[]> {
  const response = await fetch(`${API_BASE_URL}/user/${userId}/words`);
  if (!response.ok) throw new Error("Failed to fetch user words");
  return response.json();
}


export async function saveWord(wordId: number, userId: number): Promise<{ message: string; already_saved: boolean }> {
  const response = await fetch(
    `${API_BASE_URL}/user-words/${wordId}/save?user_id=${userId}`,
    { method: "POST" }
  );
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || `Request failed with status ${response.status}`);
  }
  return response.json();
}

export interface WordLookupResponse {
  id: number;
  source: 'cache' | 'pons';
  word: string;
  english_meanings: string[];
  word_class: string | null;
}

export interface LibraryEntry {
  id: number;
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
