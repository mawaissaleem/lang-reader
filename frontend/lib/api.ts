// lib/api.ts

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface WordLookupResponse {
  source: 'cache' | 'pons';
  word: string;
  english_meanings: string[];
  word_class: string | null;
}

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
