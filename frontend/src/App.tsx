/**
 * Root component — Vidhi Research Workbench.
 * Three-pane layout: Threads (left) · Brief (center) · Sources + Workbook (right).
 *
 * History is server-backed. On mount we list the user's threads from the
 * backend, hydrate the sidebar, and lazy-load the messages of any thread the
 * user opens. Search/answer pass the resolved server thread_id and query_id
 * so follow-ups land in the right conversation.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Scale } from 'lucide-react';
import { SignedIn, SignedOut, UserButton, useAuth, useUser } from '@clerk/clerk-react';
import {
  performLegalSearch,
  getLegalAnswer,
  listThreads,
  fetchThread,
  deleteAllThreads,
  type ServerMessage,
} from './services/api';
import type {
  Message,
  Citation,
  QueryType,
  LegalSearchResult,
  ThreadSummary,
  VideoResult,
} from './types';
import SearchBar from './components/SearchBar';
import Brief from './components/Brief';
import LeftSidebar from './components/LeftSidebar';
import SourcesPanel from './components/SourcesPanel';
import DisclaimerFooter from './components/DisclaimerFooter';
import DevBanner from './components/DevBanner';
import ThemeToggle from './components/ThemeToggle';
import LoginPage from './components/LoginPage';
import { useTheme } from './hooks/useTheme';

const SESSION_STORAGE_KEY = 'vidhi.sessionId';

/** Get-or-create a stable session id for this browser. */
function loadOrMintSessionId(): string {
  try {
    const existing = localStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const fresh = uuidv4();
    localStorage.setItem(SESSION_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return uuidv4();
  }
}

/** Convert a server message into the in-memory Message shape. */
function fromServerMessage(m: ServerMessage): Message {
  return {
    id: m.query_id,
    threadId: m.thread_id,
    query: m.raw_query,
    search_results: m.search_results,
    videos: m.videos,
    answer: m.answer
      ? {
          content: m.answer.content,
          citations: m.answer.citations,
          suggested_steps: m.answer.suggested_steps,
          query_type: m.query_type as QueryType,
        }
      : undefined,
    timestamp: new Date(m.created_at),
  };
}

/** Sidebar placeholder message for a thread we haven't loaded yet. */
function placeholderForThread(t: ThreadSummary): Message {
  return {
    id: `placeholder:${t.id}`,
    threadId: t.id,
    query: t.title ?? 'Untitled',
    search_results: [],
    videos: [],
    timestamp: new Date(t.updated_at),
  };
}

export default function App() {
  useTheme();
  return (
    <>
      <SignedOut>
        <LoginPage />
      </SignedOut>
      <SignedIn>
        <AuthenticatedApp />
      </SignedIn>
    </>
  );
}

function AuthenticatedApp() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const getAuthToken = useCallback(() => getToken(), [getToken]);
  const [sessionId] = useState<string>(loadOrMintSessionId);

  const [messages, setMessages] = useState<Message[]>([]);
  const loadedThreadIds = useRef<Set<string>>(new Set());

  /** Sentinel 'new' = blank composer; null = pick the most recent thread. */
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [pinnedUrls, setPinnedUrls] = useState<Set<string>>(new Set());
  const [pinnedResults, setPinnedResults] = useState<LegalSearchResult[]>([]);
  const [flashUrl, setFlashUrl] = useState<string | undefined>(undefined);

  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // ── Bootstrap: list threads, auto-open the most recent one ────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const threads = await listThreads(user?.id, getAuthToken);
        if (cancelled || threads.length === 0) return;

        // Seed sidebar with placeholders for every thread; the most recent
        // gets fully loaded so the workbench has something to render.
        setMessages(threads.map(placeholderForThread));

        const mostRecent = threads[0];
        await loadThread(mostRecent.id);
        if (!cancelled) setActiveThreadId(mostRecent.id);
      } catch (err) {
        // Silent — most likely a transient 401 right after mount before
        // Clerk has finished hydrating the session. The user can still type
        // a query and we'll create a fresh thread.
        console.warn('Failed to bootstrap threads:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Replace any placeholder/loaded messages for a thread with fresh server data. */
  const loadThread = useCallback(async (threadId: string) => {
    if (loadedThreadIds.current.has(threadId)) return;
    try {
      const thread = await fetchThread(threadId, user?.id, getAuthToken);
      const serverMsgs = thread.messages.map(fromServerMessage);
      setMessages(prev => {
        // Drop in-memory rows for this thread except in-flight ones we'd lose.
        const inflight = prev.filter(
          m => m.threadId === threadId && (m.isSearching || m.isAnswering),
        );
        const others = prev.filter(m => m.threadId !== threadId);
        return [...others, ...serverMsgs, ...inflight];
      });
      loadedThreadIds.current.add(threadId);
    } catch (err) {
      console.warn('Failed to load thread', threadId, err);
    }
  }, [user?.id, getAuthToken]);

  // ── Active thread resolution ──────────────────────────────────────────────
  const activeThread = useMemo<Message[]>(() => {
    if (activeThreadId === 'new' || activeThreadId === null) return [];
    const inThread = messages.filter(
      m => m.threadId === activeThreadId && !m.id.startsWith('placeholder:'),
    );
    return inThread;
  }, [messages, activeThreadId]);

  const latestTurn = activeThread[activeThread.length - 1];

  const handleSelectThread = (threadId: string) => {
    setActiveThreadId(threadId);
    if (threadId !== 'new') loadThread(threadId);
  };

  // ── Search + streaming answer ─────────────────────────────────────────────
  const handleSearch = async (query: string, parentThread?: string) => {
    if (!query.trim() || isLoading) return;

    // Decide the local threadId. If we're inside an existing thread, reuse it.
    // Otherwise mint a temp id; the server will assign the real one and we'll
    // swap it in when /search returns.
    const tempThreadId = parentThread && parentThread !== 'new'
      ? parentThread
      : `temp:${uuidv4()}`;
    const msgId = uuidv4();

    setMessages(prev => [
      ...prev,
      {
        id: msgId,
        threadId: tempThreadId,
        query,
        search_results: [],
        videos: [],
        isSearching: true,
        isAnswering: false,
        streamingText: '',
        timestamp: new Date(),
      },
    ]);
    setActiveThreadId(tempThreadId);
    setIsLoading(true);

    try {
      const serverThreadIdInput =
        parentThread && parentThread !== 'new' && !parentThread.startsWith('temp:')
          ? parentThread
          : undefined;

      const search = await performLegalSearch(
        sessionId,
        query,
        serverThreadIdInput,
        undefined,  // matter_id — wired in the matter-aware UI (next commit)
        user?.id,
        getAuthToken,
      );
      const realThreadId = search.thread_id;
      const realQueryId = search.query_id;
      loadedThreadIds.current.add(realThreadId);

      // Swap temp ids over to the real ones returned by the server.
      setMessages(prev =>
        prev.map(m => {
          if (m.id !== msgId) return m;
          return {
            ...m,
            id: realQueryId,
            threadId: realThreadId,
            search_results: search.results,
            videos: search.videos as VideoResult[],
            isSearching: false,
            isAnswering: true,
          };
        }),
      );
      // Also drop any placeholder for this thread; the live message replaces it.
      setMessages(prev =>
        prev.filter(m => m.id !== `placeholder:${realThreadId}`),
      );
      setActiveThreadId(realThreadId);

      await getLegalAnswer(
        sessionId,
        query,
        realQueryId,
        realThreadId,
        (chunk: string) => {
          setMessages(prev =>
            prev.map(m =>
              m.id === realQueryId
                ? { ...m, streamingText: (m.streamingText ?? '') + chunk }
                : m,
            ),
          );
        },
        (citations: Citation[], suggested_steps: string[]) => {
          setMessages(prev =>
            prev.map(m => {
              if (m.id !== realQueryId) return m;
              return {
                ...m,
                isAnswering: false,
                streamingText: undefined,
                answer: {
                  content: m.streamingText ?? '',
                  citations,
                  suggested_steps,
                  query_type: search.query_type as QueryType,
                },
              };
            }),
          );
          setIsLoading(false);
        },
        (error: string) => {
          setMessages(prev =>
            prev.map(m =>
              m.id === realQueryId
                ? {
                    ...m,
                    isAnswering: false,
                    answer: {
                      content: `⚠️ Error: ${error}`,
                      citations: [],
                      suggested_steps: [],
                      query_type: 'general' as QueryType,
                    },
                  }
                : m,
            ),
          );
          setIsLoading(false);
        },
        user?.id,
        getAuthToken,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred';
      setMessages(prev =>
        prev.map(m =>
          m.id === msgId
            ? {
                ...m,
                isSearching: false,
                isAnswering: false,
                answer: {
                  content: `⚠️ Error: ${msg}`,
                  citations: [],
                  suggested_steps: [],
                  query_type: 'general' as QueryType,
                },
              }
            : m,
        ),
      );
      setIsLoading(false);
    }
  };

  const handleTogglePin = (url: string, result: LegalSearchResult) => {
    setPinnedUrls(prev => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
    setPinnedResults(prev => {
      if (prev.some(r => r.url === url)) return prev.filter(r => r.url !== url);
      return [result, ...prev];
    });
  };

  const handleCitationClick = (citation: Citation, results: LegalSearchResult[]) => {
    const needle = citation.text.toLowerCase();
    const hit =
      results.find(r => r.citation && r.citation.toLowerCase().includes(needle)) ??
      results.find(r => r.title.toLowerCase().includes(needle)) ??
      pinnedResults.find(r => r.citation && r.citation.toLowerCase().includes(needle));

    if (hit) {
      setFlashUrl(hit.url);
      setTimeout(() => setFlashUrl(undefined), 1200);
    } else if (citation.url) {
      window.open(citation.url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleNewThread = () => {
    setActiveThreadId('new');
  };

  const handleClearAll = async () => {
    try {
      await deleteAllThreads(user?.id, getAuthToken);
    } catch (err) {
      console.warn('Failed to clear server history:', err);
    }
    setMessages([]);
    loadedThreadIds.current.clear();
    setActiveThreadId(null);
    setPinnedUrls(new Set());
    setPinnedResults([]);
  };

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      <DevBanner />

      <header
        className="flex items-center justify-between px-6 py-3 border-b flex-shrink-0"
        style={{ backgroundColor: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <Scale size={26} style={{ color: 'var(--accent)' }} />
          <div>
            <h1
              className="text-lg font-bold tracking-tight m-0"
              style={{ color: 'var(--accent-bright)', fontFamily: 'Georgia, serif' }}
            >
              Vidhi
            </h1>
            <p className="text-[10px] m-0" style={{ color: 'var(--text-muted)' }}>
              Indian Legal Workbench · for working advocates
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <LeftSidebar
          messages={messages}
          activeThreadId={activeThreadId === 'new' ? null : activeThreadId}
          onSelectThread={handleSelectThread}
          onNew={handleNewThread}
          onClear={handleClearAll}
          pinnedResults={pinnedResults}
          onTogglePin={handleTogglePin}
          flashUrl={flashUrl}
          collapsed={leftCollapsed}
          onToggleCollapsed={() => setLeftCollapsed(v => !v)}
        />

        <main
          className="flex-1 flex flex-col min-w-0 overflow-hidden"
          style={{ backgroundColor: 'var(--bg)' }}
        >
          <div className="flex-1 min-h-0 overflow-hidden">
            <Brief
              messages={activeThread}
              pinnedUrls={pinnedUrls}
              onCitationClick={handleCitationClick}
              onFollowUp={(query: string) =>
                handleSearch(query, latestTurn?.threadId)
              }
            />
          </div>

          <div
            className="flex-shrink-0 border-t px-6 py-3"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <SearchBar
              onSearch={(q: string) => handleSearch(q, latestTurn?.threadId)}
              isLoading={isLoading}
            />
          </div>
        </main>

        <SourcesPanel
          results={latestTurn?.search_results ?? []}
          videos={latestTurn?.videos ?? []}
          pinnedUrls={pinnedUrls}
          onTogglePin={handleTogglePin}
          flashUrl={flashUrl}
          isSearching={latestTurn?.isSearching}
          collapsed={rightCollapsed}
          onToggleCollapsed={() => setRightCollapsed(v => !v)}
        />
      </div>

      <div className="flex-shrink-0" style={{ backgroundColor: 'var(--bg)' }}>
        <DisclaimerFooter />
      </div>

      <style>
        {`
          @keyframes flash {
            0%, 100% { box-shadow: 0 0 0 0 transparent; }
            30%      { box-shadow: 0 0 0 3px var(--accent-flash); }
          }
        `}
      </style>
    </div>
  );
}
