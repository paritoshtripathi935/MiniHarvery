/**
 * API service — handles legal search requests and SSE streaming for answers.
 *
 * Auth: every call passes Clerk's `useAuth().getToken` as `getToken`. The
 * resulting JWT is attached as `Authorization: Bearer <jwt>` and verified
 * server-side against Clerk's JWKS. The backend rejects unauthenticated
 * requests with 401 — there is no guest path.
 */
import type {
  Citation,
  LegalSearchResult,
  ThreadSummary,
  VideoResult,
} from '../types';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export type GetToken = () => Promise<string | null>;

async function buildHeaders(userId?: string, getToken?: GetToken): Promise<HeadersInit> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (userId) headers['X-User-Id'] = userId;
  if (getToken) {
    try {
      const token = await getToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    } catch {
      // Token fetch failed — backend will return 401 and the UI shows the error.
    }
  }
  return headers;
}

// ── Search ───────────────────────────────────────────────────────────────

export interface SearchResponse {
  thread_id: string;
  query_id: string;
  results: LegalSearchResult[];
  videos: VideoResult[];
  query_type: string;
}

export async function performLegalSearch(
  sessionId: string,
  query: string,
  threadId: string | undefined,
  userId?: string,
  getToken?: GetToken,
): Promise<SearchResponse> {
  const body: { query: string; thread_id?: string } = { query };
  if (threadId) body.thread_id = threadId;

  const response = await fetch(`${BASE_URL}/api/v1/search/${sessionId}`, {
    method: 'POST',
    headers: await buildHeaders(userId, getToken),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.detail ?? `Search failed (${response.status})`);
  }

  const json = await response.json();
  return {
    thread_id: json.data.thread_id,
    query_id: json.data.query_id,
    results: json.data.results,
    videos: json.data.videos,
    query_type: json.data.query_type,
  };
}

// ── Answer (streaming SSE) ────────────────────────────────────────────────

export async function getLegalAnswer(
  sessionId: string,
  query: string,
  queryId: string | undefined,
  threadId: string | undefined,
  onChunk: (chunk: string) => void,
  onDone: (citations: Citation[], suggested_steps: string[]) => void,
  onError: (message: string) => void,
  userId?: string,
  getToken?: GetToken,
): Promise<void> {
  const body: { query: string; query_id?: string; thread_id?: string } = { query };
  if (queryId) body.query_id = queryId;
  if (threadId) body.thread_id = threadId;

  const response = await fetch(`${BASE_URL}/api/v1/answer/${sessionId}`, {
    method: 'POST',
    headers: await buildHeaders(userId, getToken),
    body: JSON.stringify(body),
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

// ── Threads (history) ────────────────────────────────────────────────────

export async function listThreads(
  userId?: string,
  getToken?: GetToken,
): Promise<ThreadSummary[]> {
  const response = await fetch(`${BASE_URL}/api/v1/threads`, {
    method: 'GET',
    headers: await buildHeaders(userId, getToken),
  });
  if (!response.ok) {
    if (response.status === 401) return [];
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.detail ?? `Failed to list threads (${response.status})`);
  }
  const json = await response.json();
  return json.data.threads;
}

export interface ServerMessage {
  query_id: string;
  thread_id: string;
  raw_query: string;
  query_type: string;
  created_at: string;
  search_results: LegalSearchResult[];
  videos: VideoResult[];
  answer: {
    content: string;
    status: string;
    model: string;
    latency_ms: number | null;
    citations: Citation[];
    suggested_steps: string[];
  } | null;
}

export interface ServerThread {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  messages: ServerMessage[];
}

export async function fetchThread(
  threadId: string,
  userId?: string,
  getToken?: GetToken,
): Promise<ServerThread> {
  const response = await fetch(`${BASE_URL}/api/v1/threads/${threadId}`, {
    method: 'GET',
    headers: await buildHeaders(userId, getToken),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.detail ?? `Failed to load thread (${response.status})`);
  }
  const json = await response.json();
  return json.data;
}

export async function deleteThread(
  threadId: string,
  userId?: string,
  getToken?: GetToken,
): Promise<void> {
  const response = await fetch(`${BASE_URL}/api/v1/threads/${threadId}`, {
    method: 'DELETE',
    headers: await buildHeaders(userId, getToken),
  });
  if (!response.ok && response.status !== 204) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.detail ?? `Failed to delete thread (${response.status})`);
  }
}

export async function deleteAllThreads(
  userId?: string,
  getToken?: GetToken,
): Promise<void> {
  const response = await fetch(`${BASE_URL}/api/v1/threads`, {
    method: 'DELETE',
    headers: await buildHeaders(userId, getToken),
  });
  if (!response.ok && response.status !== 204) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.detail ?? `Failed to clear history (${response.status})`);
  }
}

// ── Session (legacy single-session delete; kept but unused by App) ───────

export async function clearSession(
  sessionId: string,
  userId?: string,
  getToken?: GetToken,
): Promise<void> {
  await fetch(`${BASE_URL}/api/v1/session/${sessionId}`, {
    method: 'DELETE',
    headers: await buildHeaders(userId, getToken),
  });
}
