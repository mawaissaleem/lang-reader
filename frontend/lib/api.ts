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
