/**
 * Root component — Vidhi Research Workbench.
 * Three-pane layout: Threads (left) · Brief (center) · Sources + Workbook (right).
 *
 * History is server-backed and matter-scoped. On mount we fetch the user's
 * matters; the most recently-active matter (with Inbox as fallback) is
 * loaded into view. Threads are scoped to the active matter; new searches
 * land in that matter; "Save as brief" persists into that matter.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Scale } from 'lucide-react';
import { SignedIn, SignedOut, UserButton, useAuth, useUser } from '@clerk/clerk-react';
import {
  performLegalSearch,
  getLegalAnswer,
  fetchThread,
  listMatters,
  getMatter,
  createMatter,
  generateCaseBrief,
  getDocument,
  type ServerMessage,
} from './services/api';
import type {
  Message,
  Citation,
  QueryType,
  LegalSearchResult,
  MatterSummary,
  MatterDetail,
  CaseBriefDocument,
  DocumentRecord,
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
import MatterSelector from './components/MatterSelector';
import CaseBriefView from './components/CaseBriefView';
import DocumentList from './components/DocumentList';
import { useTheme } from './hooks/useTheme';

const SESSION_STORAGE_KEY = 'vidhi.sessionId';
const ACTIVE_MATTER_STORAGE_KEY = 'vidhi.activeMatterId';

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

  // ── Matters ───────────────────────────────────────────────────────────────
  const [matters, setMatters] = useState<MatterSummary[]>([]);
  const [activeMatterId, setActiveMatterId] = useState<string | null>(null);
  const [activeMatter, setActiveMatter] = useState<MatterDetail | null>(null);

  // ── Threads / messages (scoped to active matter) ──────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const loadedThreadIds = useRef<Set<string>>(new Set());
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // ── Pinned sources / UI ───────────────────────────────────────────────────
  const [pinnedUrls, setPinnedUrls] = useState<Set<string>>(new Set());
  const [pinnedResults, setPinnedResults] = useState<LegalSearchResult[]>([]);
  const [flashUrl, setFlashUrl] = useState<string | undefined>(undefined);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // ── Case brief modal state ────────────────────────────────────────────────
  const [briefSeed, setBriefSeed] = useState<
    { url?: string; text?: string; title?: string; queryId?: string } | null
  >(null);
  const [openBrief, setOpenBrief] = useState<CaseBriefDocument | null>(null);

  // ── Bootstrap: list matters, pick active, load detail ─────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listMatters(user?.id, getAuthToken);
        if (cancelled) return;
        setMatters(list);
        if (list.length === 0) return;

        const stored =
          (() => {
            try {
              return localStorage.getItem(ACTIVE_MATTER_STORAGE_KEY) ?? null;
            } catch {
              return null;
            }
          })();
        const target =
          (stored && list.find(m => m.id === stored)?.id) ??
          list.find(m => m.is_inbox)?.id ??
          list[0].id;
        await switchMatter(target, list);
      } catch (err) {
        console.warn('Failed to bootstrap matters:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Switch the active matter — fetch its detail, hydrate sidebar with
   *  thread placeholders, auto-load the most recent thread. */
  const switchMatter = useCallback(
    async (matterId: string, matterList?: MatterSummary[]) => {
      const fromList =
        (matterList ?? matters).find(m => m.id === matterId) ?? null;
      setActiveMatterId(matterId);
      try {
        localStorage.setItem(ACTIVE_MATTER_STORAGE_KEY, matterId);
      } catch {
        /* ignore */
      }
      try {
        const detail = await getMatter(matterId, user?.id, getAuthToken);
        setActiveMatter(detail);
        // Reset thread/message scope to this matter; placeholders for each
        // thread, then auto-load the most recent.
        loadedThreadIds.current = new Set();
        const placeholders: Message[] = detail.threads.map(t => ({
          id: `placeholder:${t.id}`,
          threadId: t.id,
          query: t.title ?? 'Untitled',
          search_results: [],
          videos: [],
          timestamp: new Date(t.updated_at),
        }));
        setMessages(placeholders);

        if (detail.threads.length > 0) {
          const newest = detail.threads[0];
          await loadThread(newest.id);
          setActiveThreadId(newest.id);
        } else {
          setActiveThreadId(null);
        }
      } catch (err) {
        console.warn('Failed to load matter', matterId, err);
        if (fromList) setActiveMatter(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matters, user?.id, getAuthToken],
  );

  /** Replace placeholder/loaded messages for a thread with fresh server data. */
  const loadThread = useCallback(
    async (threadId: string) => {
      if (loadedThreadIds.current.has(threadId)) return;
      try {
        const thread = await fetchThread(threadId, user?.id, getAuthToken);
        const serverMsgs = thread.messages.map(fromServerMessage);
        setMessages(prev => {
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
    },
    [user?.id, getAuthToken],
  );

  // Refresh the active matter (used after creating documents / threads).
  const refreshActiveMatter = useCallback(async () => {
    if (!activeMatterId) return;
    try {
      const detail = await getMatter(activeMatterId, user?.id, getAuthToken);
      setActiveMatter(detail);
      // Also update the matter list summary counts.
      setMatters(prev =>
        prev.map(m =>
          m.id === detail.id
            ? {
                ...m,
                title: detail.title,
                thread_count: detail.threads.length,
                document_count: detail.documents.length,
                updated_at: detail.updated_at,
              }
            : m,
        ),
      );
    } catch (err) {
      console.warn('Failed to refresh active matter:', err);
    }
  }, [activeMatterId, user?.id, getAuthToken]);

  // ── Active thread resolution (filtered to active matter) ──────────────────
  const activeThread = useMemo<Message[]>(() => {
    if (activeThreadId === null) return [];
    return messages.filter(
      m => m.threadId === activeThreadId && !m.id.startsWith('placeholder:'),
    );
  }, [messages, activeThreadId]);

  const latestTurn = activeThread[activeThread.length - 1];

  const handleSelectThread = (threadId: string) => {
    setActiveThreadId(threadId);
    if (threadId) loadThread(threadId);
  };

  // ── Search + streaming answer ─────────────────────────────────────────────
  const handleSearch = async (query: string, parentThread?: string) => {
    if (!query.trim() || isLoading) return;
    if (!activeMatterId) {
      console.warn('No active matter; refusing to search');
      return;
    }

    const tempThreadId =
      parentThread && parentThread !== 'new' ? parentThread : `temp:${uuidv4()}`;
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
        parentThread &&
        parentThread !== 'new' &&
        !parentThread.startsWith('temp:')
          ? parentThread
          : undefined;

      const search = await performLegalSearch(
        sessionId,
        query,
        serverThreadIdInput,
        activeMatterId,
        user?.id,
        getAuthToken,
      );
      const realThreadId = search.thread_id;
      const realQueryId = search.query_id;
      loadedThreadIds.current.add(realThreadId);

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
          // Refresh the matter so its updated_at + thread count reflect this turn.
          void refreshActiveMatter();
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
    setActiveThreadId(null);
  };

  const handleClearAll = async () => {
    // "Clear" inside a matter just clears the local state for now; nuking
    // the whole matter or its threads is a more destructive action that
    // needs an explicit confirmation, deferred to a later commit.
    setMessages(messages.filter(m => m.id.startsWith('placeholder:')));
    setActiveThreadId(null);
    setPinnedUrls(new Set());
    setPinnedResults([]);
  };

  // ── Matter selector handlers ──────────────────────────────────────────────
  const handleCreateMatter = async (title: string) => {
    try {
      const created = await createMatter({ title }, user?.id, getAuthToken);
      const newSummary: MatterSummary = {
        id: created.id,
        title: created.title,
        description: created.description,
        court: created.court,
        cause_number: created.cause_number,
        status: created.status,
        is_inbox: created.is_inbox,
        parties: created.parties,
        created_at: created.created_at,
        updated_at: created.updated_at,
        thread_count: created.threads.length,
        document_count: created.documents.length,
      };
      setMatters(prev => [newSummary, ...prev]);
      await switchMatter(created.id, [newSummary, ...matters]);
    } catch (err) {
      console.warn('Failed to create matter:', err);
    }
  };

  // ── Case-brief handlers ───────────────────────────────────────────────────
  const handleSaveAsBrief = (result: LegalSearchResult) => {
    setOpenBrief(null);
    setBriefSeed({
      url: result.url,
      title: result.citation || result.title,
      queryId: latestTurn?.id,  // latest turn's query_id (we set id = real query_id)
    });
  };

  const handleGenerateBrief = useCallback(
    async (input: { url?: string; text?: string; title?: string; query_id?: string }) => {
      if (!activeMatterId) throw new Error('No active matter');
      const doc = await generateCaseBrief(activeMatterId, input, user?.id, getAuthToken);
      void refreshActiveMatter();
      return doc;
    },
    [activeMatterId, user?.id, getAuthToken, refreshActiveMatter],
  );

  const handleOpenDocument = async (documentId: string) => {
    try {
      const doc = (await getDocument(
        documentId,
        user?.id,
        getAuthToken,
      )) as DocumentRecord;
      if (doc.type === 'case_brief') {
        setBriefSeed(null);
        setOpenBrief(doc as unknown as CaseBriefDocument);
      }
    } catch (err) {
      console.warn('Failed to open document:', err);
    }
  };

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--bg)' }}>
      <DevBanner />

      <header
        className="flex items-center justify-between px-6 py-3 border-b flex-shrink-0"
        style={{ backgroundColor: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Scale size={26} style={{ color: 'var(--accent)' }} />
          <div className="min-w-0">
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
          <div className="ml-3">
            <MatterSelector
              matters={matters}
              activeMatterId={activeMatterId}
              onSelect={(id) => void switchMatter(id)}
              onCreate={handleCreateMatter}
            />
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
          documentsSlot={
            activeMatter && activeMatter.documents.length > 0 ? (
              <DocumentList
                documents={activeMatter.documents}
                onOpen={(id) => void handleOpenDocument(id)}
              />
            ) : null
          }
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
          onSaveAsBrief={handleSaveAsBrief}
        />
      </div>

      <div className="flex-shrink-0" style={{ backgroundColor: 'var(--bg)' }}>
        <DisclaimerFooter />
      </div>

      <CaseBriefView
        open={briefSeed !== null || openBrief !== null}
        seed={briefSeed ?? undefined}
        existing={openBrief ?? undefined}
        onClose={() => {
          setBriefSeed(null);
          setOpenBrief(null);
        }}
        onGenerate={handleGenerateBrief}
      />

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
