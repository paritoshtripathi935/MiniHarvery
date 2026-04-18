/**
 * API service — mirrors MiniPerplexity's api.ts.
 * Handles legal search requests and SSE streaming for answers.
 */
import type { LegalSearchResult, VideoResult, Citation } from '../types';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

function buildHeaders(userId?: string): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (userId) headers['X-User-Id'] = userId;
  return headers;
}

// ── Search ───────────────────────────────────────────────────────────────

export async function performLegalSearch(
  sessionId: string,
  query: string,
  userId?: string,
): Promise<{ results: LegalSearchResult[]; videos: VideoResult[]; query_type: string }> {
  const response = await fetch(`${BASE_URL}/api/v1/search/${sessionId}`, {
    method: 'POST',
    headers: buildHeaders(userId),
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.detail ?? `Search failed (${response.status})`);
  }

  const json = await response.json();
  return json.data;
}

// ── Answer (streaming SSE) ────────────────────────────────────────────────

export async function getLegalAnswer(
  sessionId: string,
  query: string,
  onChunk: (chunk: string) => void,
  onDone: (citations: Citation[], suggested_steps: string[]) => void,
  onError: (message: string) => void,
  userId?: string,
): Promise<void> {
  const response = await fetch(`${BASE_URL}/api/v1/answer/${sessionId}`, {
    method: 'POST',
    headers: buildHeaders(userId),
    body: JSON.stringify({ query }),
  });

  if (!response.ok || !response.body) {
    const err = await response.json().catch(() => ({}));
    onError(err?.detail ?? `Answer failed (${response.status})`);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE lines
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;

      try {
        const payload = JSON.parse(raw);
        if (payload.chunk) {
          onChunk(payload.chunk);
        } else if (payload.done) {
          onDone(payload.citations ?? [], payload.suggested_steps ?? []);
        } else if (payload.error) {
          onError(payload.error);
        }
      } catch {
        // Malformed JSON line — skip
      }
    }
  }
}

// ── Session ──────────────────────────────────────────────────────────────

export async function clearSession(sessionId: string): Promise<void> {
  await fetch(`${BASE_URL}/api/v1/session/${sessionId}`, { method: 'DELETE' });
}
