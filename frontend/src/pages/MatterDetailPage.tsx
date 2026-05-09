/**
 * MatterDetailPage — the matter as a routed page, redesigned for focus.
 *
 * Old layout: left threads + workbook panel, center brief, right sources +
 * videos panel — four panels of placeholder copy on an empty matter.
 *
 * New layout:
 *   ┌─ Matter header (title · meta · inspector toggles) ─────────┐
 *   ├─ Tabs: Research · Documents · Settings ────────────────────┤
 *   │                                                            │
 *   │   Research tab:                                            │
 *   │     ┌─ Threads ▾  [active]   + New thread ─────────────┐  │
 *   │     │                                                  │  │
 *   │     │   Brief / answer (focused)                       │  │
 *   │     │                                                  │  │
 *   │     │   Composer ─────────────────────────────────────│  │
 *   │     └──────────────────────────────────────────────────┘  │
 *   │                                                            │
 *   └────────────────────────────────────────────────────────────┘
 *
 * Sources / Videos / Pinned cards collapse into a single Inspector
 * drawer that opens from the right when the user toggles a header chip.
 *
 * Empty state for an empty matter is now a single composer with a
 * helpful prompt — not four placeholder panels.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Briefcase, Inbox, Scale } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useAuth, useUser } from '@clerk/clerk-react';
import {
  performLegalSearch,
  getLegalAnswer,
  fetchThread,
  getMatter,
  generateCaseBrief,
  type ServerMessage,
} from '../services/api';
import type {
  Message,
  Citation,
  QueryType,
  LegalSearchResult,
  MatterDetail,
  DocumentRecord,
  VideoResult,
} from '../types';
import { useMatters } from '../state/MattersContext';
import { Breadcrumbs, Crumb } from '../layout/Breadcrumbs';
import { t } from '../design/tokens';

import SearchBar from '../components/SearchBar';
import Brief from '../components/Brief';
import NewBriefDialog from '../components/NewBriefDialog';
import DocumentList from '../components/DocumentList';
import ThreadPicker from '../components/ThreadPicker';
import MatterTabs, { type MatterTab } from '../components/MatterTabs';
import NewDraftDialog from '../components/NewDraftDialog';
import MatterSettingsForm from '../components/MatterSettingsForm';
import {
  Inspector,
  InspectorToggleGroup,
  type InspectorTab,
} from '../components/Inspector';
import { Plus, FilePlus } from 'lucide-react';

const SESSION_STORAGE_KEY = 'vidhi.sessionId';

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

export default function MatterDetailPage() {
  const { matterId = '' } = useParams<{ matterId: string }>();
  const navigate = useNavigate();
  const { user } = useUser();
  const { getToken } = useAuth();
  const { matters, refresh: refreshMattersList } = useMatters();
  const getAuthToken = useCallback(() => getToken(), [getToken]);

  const summary = useMemo(
    () => matters.find(m => m.id === matterId) ?? null,
    [matters, matterId],
  );

  const [sessionId] = useState<string>(loadOrMintSessionId);
  const [activeMatter, setActiveMatter] = useState<MatterDetail | null>(null);
  const [matterError, setMatterError] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const loadedThreadIds = useRef<Set<string>>(new Set());
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [pinnedUrls, setPinnedUrls] = useState<Set<string>>(new Set());
  const [pinnedResults, setPinnedResults] = useState<LegalSearchResult[]>([]);
  const [flashUrl, setFlashUrl] = useState<string | undefined>(undefined);

  const [activeTab, setActiveTab] = useState<MatterTab>('research');
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('sources');

  // Single source of truth for the create-brief dialog. When non-null,
  // dialog is open with these seeds. Closing nulls it.
  const [briefDialogSeed, setBriefDialogSeed] = useState<
    { url?: string; title?: string; queryId?: string } | null
  >(null);

  const [draftDialogOpen, setDraftDialogOpen] = useState(false);

  // ── Bootstrap: fetch this matter's detail ─────────────────────────────────
  useEffect(() => {
    if (!matterId) return;
    let cancelled = false;
    setActiveMatter(null);
    setMessages([]);
    setActiveThreadId(null);
    setActiveTab('research');
    setInspectorOpen(false);
    loadedThreadIds.current = new Set();

    (async () => {
      try {
        const detail = await getMatter(matterId, user?.id, getAuthToken);
        if (cancelled) return;
        setActiveMatter(detail);

        const placeholders: Message[] = detail.threads.map(th => ({
          id: `placeholder:${th.id}`,
          threadId: th.id,
          query: th.title ?? 'Untitled',
          search_results: [],
          videos: [],
          timestamp: new Date(th.updated_at),
        }));
        setMessages(placeholders);

        if (detail.threads.length > 0) {
          const newest = detail.threads[0];
          await loadThread(newest.id);
          if (!cancelled) setActiveThreadId(newest.id);
        }
      } catch (err) {
        if (!cancelled) {
          setMatterError(err instanceof Error ? err.message : 'Could not load matter');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matterId]);

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

  const refreshActiveMatter = useCallback(async () => {
    if (!matterId) return;
    try {
      const detail = await getMatter(matterId, user?.id, getAuthToken);
      setActiveMatter(detail);
      void refreshMattersList();
    } catch (err) {
      console.warn('Failed to refresh active matter:', err);
    }
  }, [matterId, user?.id, getAuthToken, refreshMattersList]);

  // ── Active thread filtered to this matter's loaded messages ───────────────
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

  // ── Inspector helpers ─────────────────────────────────────────────────────
  const openInspectorTab = (tab: InspectorTab) => {
    if (inspectorOpen && inspectorTab === tab) {
      setInspectorOpen(false);  // toggle off if same tab clicked
    } else {
      setInspectorTab(tab);
      setInspectorOpen(true);
    }
  };

  // ── Search + streaming answer (unchanged in shape; matter-scoped) ─────────
  const handleSearch = async (query: string, parentThread?: string) => {
    if (!query.trim() || isLoading || !matterId) return;

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
        matterId,
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
      // Auto-pop the inspector to Sources so the user sees what we found
      // without having to click. They can dismiss with Esc / the chevron.
      setInspectorTab('sources');
      setInspectorOpen(true);

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

  const handleCitationClick = (
    citation: Citation,
    results: LegalSearchResult[],
  ) => {
    const needle = citation.text.toLowerCase();
    const hit =
      results.find(r => r.citation && r.citation.toLowerCase().includes(needle)) ??
      results.find(r => r.title.toLowerCase().includes(needle)) ??
      pinnedResults.find(r => r.citation && r.citation.toLowerCase().includes(needle));

    if (hit) {
      // Make sure inspector is open on Sources so the flash is visible.
      setInspectorTab('sources');
      setInspectorOpen(true);
      setFlashUrl(hit.url);
      setTimeout(() => setFlashUrl(undefined), 1200);
    } else if (citation.url) {
      window.open(citation.url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleNewThread = () => setActiveThreadId(null);

  // "Save as brief" on a search result → open dialog prefilled with that URL.
  const handleSaveAsBrief = (result: LegalSearchResult) => {
    setBriefDialogSeed({
      url: result.url,
      title: result.citation || result.title,
      queryId: latestTurn?.id,
    });
  };

  // "+ New brief" on the Documents tab → open dialog blank.
  const handleNewBriefFromTab = () => {
    setBriefDialogSeed({});
  };

  const handleGenerateBrief = useCallback(
    async (input: { url?: string; text?: string; title?: string; query_id?: string }) => {
      if (!matterId) throw new Error('No active matter');
      const doc = await generateCaseBrief(matterId, input, user?.id, getAuthToken);
      void refreshActiveMatter();
      return doc;
    },
    [matterId, user?.id, getAuthToken, refreshActiveMatter],
  );

  // After the dialog generates a brief, close it and route to the document page.
  const handleBriefCreated = (doc: { id: string }) => {
    setBriefDialogSeed(null);
    navigate(`/matters/${matterId}/documents/${doc.id}`);
  };

  // Click a document in the Documents list → navigate to its page.
  const handleOpenDocument = (documentId: string) => {
    navigate(`/matters/${matterId}/documents/${documentId}`);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (matterError) {
    return (
      <div style={{ padding: t.space.xl, color: t.color.danger }}>
        Could not load matter: {matterError}{' '}
        <button
          onClick={() => navigate('/matters')}
          style={{
            color: t.color.accent,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          ← Back to matters
        </button>
      </div>
    );
  }

  const inspectorCounts = {
    sources: latestTurn?.search_results.length ?? 0,
    videos: latestTurn?.videos.length ?? 0,
    pinned: pinnedResults.length,
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Breadcrumbs>
        <Crumb to={summary?.is_inbox ? '/' : '/matters'}>
          {summary?.is_inbox ? 'Today' : 'Matters'}
        </Crumb>
        <Crumb>{summary?.title ?? activeMatter?.title ?? 'Loading…'}</Crumb>
      </Breadcrumbs>

      <MatterHeader
        matter={summary}
        detail={activeMatter}
        inspector={
          activeTab === 'research' ? (
            <InspectorToggleGroup
              active={inspectorOpen ? inspectorTab : null}
              open={inspectorOpen}
              onSelect={openInspectorTab}
              counts={inspectorCounts}
            />
          ) : null
        }
      />

      <MatterTabs
        active={activeTab}
        onChange={tab => {
          setActiveTab(tab);
          if (tab !== 'research') setInspectorOpen(false);
        }}
        documentCount={activeMatter?.documents.length ?? 0}
      />

      <div className="flex-1 flex overflow-hidden min-h-0">
        {activeTab === 'research' && (
          <ResearchView
            messages={messages}
            activeThreadId={activeThreadId}
            activeThread={activeThread}
            isLoading={isLoading}
            pinnedUrls={pinnedUrls}
            onSelectThread={handleSelectThread}
            onNewThread={handleNewThread}
            onSearch={handleSearch}
            onCitationClick={handleCitationClick}
            latestTurnThreadId={latestTurn?.threadId}
          />
        )}
        {activeTab === 'documents' && (
          <DocumentsView
            documents={activeMatter?.documents ?? []}
            onOpen={handleOpenDocument}
            onNewBrief={handleNewBriefFromTab}
            onNewDraft={() => setDraftDialogOpen(true)}
          />
        )}
        {activeTab === 'settings' && activeMatter && (
          <MatterSettingsForm
            matter={activeMatter}
            onUpdated={setActiveMatter}
          />
        )}

        {activeTab === 'research' && inspectorOpen && (
          <Inspector
            open={inspectorOpen}
            activeTab={inspectorTab}
            onClose={() => setInspectorOpen(false)}
            onTabChange={setInspectorTab}
            results={latestTurn?.search_results ?? []}
            videos={latestTurn?.videos ?? []}
            pinnedResults={pinnedResults}
            pinnedUrls={pinnedUrls}
            onTogglePin={handleTogglePin}
            flashUrl={flashUrl}
            isSearching={latestTurn?.isSearching}
            onSaveAsBrief={handleSaveAsBrief}
          />
        )}
      </div>

      <NewBriefDialog
        open={briefDialogSeed !== null}
        seedUrl={briefDialogSeed?.url}
        seedTitle={briefDialogSeed?.title}
        seedQueryId={briefDialogSeed?.queryId}
        onClose={() => setBriefDialogSeed(null)}
        onGenerate={handleGenerateBrief}
        onCreated={handleBriefCreated}
      />

      <NewDraftDialog
        open={draftDialogOpen}
        matterId={matterId}
        onClose={() => setDraftDialogOpen(false)}
        onCreated={doc => {
          setDraftDialogOpen(false);
          void refreshActiveMatter();
          navigate(`/matters/${matterId}/documents/${doc.id}`);
        }}
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

// ─── Matter header ─────────────────────────────────────────────────────────

function MatterHeader({
  matter,
  detail,
  inspector,
}: {
  matter: ReturnType<typeof useMatters>['matters'][number] | null;
  detail: MatterDetail | null;
  inspector: React.ReactNode;
}) {
  const display = matter ?? detail;
  if (!display) {
    return <div style={{ height: '64px', flexShrink: 0 }} />;
  }
  const Icon = display.is_inbox ? Inbox : Briefcase;
  return (
    <header
      className="flex items-center justify-between flex-shrink-0"
      style={{
        padding: `${t.space.md} ${t.space.lg}`,
        backgroundColor: t.color.surface,
        gap: t.space.md,
      }}
    >
      <div className="flex items-center min-w-0" style={{ gap: t.space.md }}>
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{
            width: '40px',
            height: '40px',
            borderRadius: t.radius.sm,
            backgroundColor: display.is_inbox ? t.color.hover : t.color.raised,
            color: display.is_inbox ? t.color.accent : t.color.muted,
          }}
        >
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <h1
            className="serif truncate m-0"
            style={{
              fontSize: '24px',
              fontWeight: t.weight.semibold,
              color: t.color.text,
              letterSpacing: '-0.01em',
              lineHeight: 1.2,
            }}
          >
            {display.title}
          </h1>
          {(display.court || display.cause_number || display.parties.length > 0) && (
            <p
              className="m-0 truncate"
              style={{
                fontSize: t.size.ui,
                color: t.color.muted,
                marginTop: '2px',
              }}
            >
              {[
                display.court,
                display.cause_number,
                display.parties.length > 0
                  ? display.parties.map(p => p.name).join(' v. ')
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>
      </div>

      {inspector}
    </header>
  );
}

// ─── Research view ─────────────────────────────────────────────────────────

function ResearchView({
  messages,
  activeThreadId,
  activeThread,
  isLoading,
  pinnedUrls,
  onSelectThread,
  onNewThread,
  onSearch,
  onCitationClick,
  latestTurnThreadId,
}: {
  messages: Message[];
  activeThreadId: string | null;
  activeThread: Message[];
  isLoading: boolean;
  pinnedUrls: Set<string>;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  onSearch: (query: string, parentThread?: string) => void;
  onCitationClick: (c: Citation, results: LegalSearchResult[]) => void;
  latestTurnThreadId: string | undefined;
}) {
  const isEmpty = activeThread.length === 0;

  return (
    <main
      className="flex-1 flex flex-col min-w-0 overflow-hidden"
      style={{ backgroundColor: t.color.bg }}
    >
      {/* Sub-bar: thread picker only. Compact. */}
      <div
        className="flex items-center"
        style={{
          gap: t.space.sm,
          padding: `${t.space.sm} ${t.space.lg}`,
          borderBottom: `1px solid ${t.color.border}`,
          flexShrink: 0,
        }}
      >
        <ThreadPicker
          messages={messages}
          activeThreadId={activeThreadId}
          onSelect={onSelectThread}
          onNew={onNewThread}
        />
      </div>

      {/* Brief area / empty state */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {isEmpty ? <ResearchEmpty /> : (
          <Brief
            messages={activeThread}
            pinnedUrls={pinnedUrls}
            onCitationClick={onCitationClick}
            onFollowUp={(query: string) => onSearch(query, latestTurnThreadId)}
          />
        )}
      </div>

      {/* Composer */}
      <div
        className="flex-shrink-0"
        style={{
          borderTop: `1px solid ${t.color.border}`,
          backgroundColor: t.color.surface,
          padding: `${t.space.sm} ${t.space.lg}`,
        }}
      >
        <SearchBar
          onSearch={(q: string) => onSearch(q, latestTurnThreadId)}
          isLoading={isLoading}
        />
      </div>
    </main>
  );
}

function ResearchEmpty() {
  return (
    <div
      className="h-full flex items-center justify-center"
      style={{ padding: t.space.xl }}
    >
      <div style={{ textAlign: 'center', maxWidth: '52ch' }}>
        <Scale size={28} style={{ color: t.color.accentSoft, margin: '0 auto' }} />
        <h2
          className="serif m-0"
          style={{
            fontSize: '22px',
            fontWeight: t.weight.semibold,
            color: t.color.text,
            marginTop: t.space.md,
            letterSpacing: '-0.01em',
          }}
        >
          Ask a legal question to begin.
        </h2>
        <p
          className="m-0"
          style={{
            fontSize: t.size.body,
            color: t.color.muted,
            marginTop: t.space.sm,
            lineHeight: 1.6,
          }}
        >
          Vidhi will search Indian Kanoon, India Code, and the web — then
          draft a structured brief with citations. You can save the brief
          to this matter, pin sources, and follow up with refinements.
        </p>
      </div>
    </div>
  );
}

// ─── Documents view ────────────────────────────────────────────────────────

function DocumentsView({
  documents,
  onOpen,
  onNewBrief,
  onNewDraft,
}: {
  documents: DocumentRecord[];
  onOpen: (id: string) => void;
  onNewBrief: () => void;
  onNewDraft: () => void;
}) {
  return (
    <main
      className="flex-1 overflow-y-auto"
      style={{
        backgroundColor: t.color.bg,
        padding: `${t.space.lg} ${t.space.xl}`,
      }}
    >
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <header
          className="flex items-end justify-between"
          style={{ gap: t.space.md, marginBottom: t.space.lg }}
        >
          <div>
            <h2
              className="serif m-0"
              style={{
                fontSize: t.size.h2,
                fontWeight: t.weight.semibold,
                color: t.color.text,
              }}
            >
              Documents
            </h2>
            <p
              className="m-0"
              style={{
                fontSize: t.size.body,
                color: t.color.muted,
                marginTop: t.space.xs,
              }}
            >
              {documents.length === 0
                ? 'Case briefs, drafts, and notes saved in this matter.'
                : `${documents.length} ${documents.length === 1 ? 'document' : 'documents'} in this matter.`}
            </p>
          </div>
          <div className="flex items-center" style={{ gap: t.space.sm }}>
            <button
              onClick={onNewDraft}
              className="inline-flex items-center cursor-pointer"
              style={{
                gap: t.space.xs,
                padding: `${t.space.sm} ${t.space.md}`,
                fontSize: t.size.ui,
                fontWeight: t.weight.medium,
                color: t.color.text,
                backgroundColor: 'transparent',
                border: `1px solid ${t.color.border}`,
                borderRadius: t.radius.md,
                transition: t.motion.fast,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = t.color.accent;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = t.color.border;
              }}
            >
              <FilePlus size={13} />
              New draft
            </button>
            <button
              onClick={onNewBrief}
              className="inline-flex items-center cursor-pointer border-0"
              style={{
                gap: t.space.xs,
                padding: `${t.space.sm} ${t.space.md}`,
                fontSize: t.size.ui,
                fontWeight: t.weight.semibold,
                color: t.color.bg,
                backgroundColor: t.color.accent,
                borderRadius: t.radius.md,
                transition: t.motion.fast,
              }}
            >
              <Plus size={13} />
              New brief
            </button>
          </div>
        </header>

        {documents.length === 0 ? (
          <div
            style={{
              padding: `${t.space.xl} ${t.space.lg}`,
              border: `1px dashed ${t.color.border}`,
              borderRadius: t.radius.md,
              textAlign: 'center',
            }}
          >
            <p
              className="m-0"
              style={{
                fontSize: t.size.body,
                color: t.color.muted,
                maxWidth: '52ch',
                margin: '0 auto',
                lineHeight: 1.6,
              }}
            >
              Case briefs (research → structured summary) and pleading drafts
              (form → first-pass document) live here. Mark them final, edit
              any section inline, or paste them into your filing.
            </p>
            <div
              className="inline-flex items-center"
              style={{ gap: t.space.sm, marginTop: t.space.lg }}
            >
              <button
                onClick={onNewDraft}
                className="inline-flex items-center cursor-pointer"
                style={{
                  gap: t.space.xs,
                  padding: `${t.space.sm} ${t.space.md}`,
                  fontSize: t.size.ui,
                  fontWeight: t.weight.medium,
                  color: t.color.text,
                  backgroundColor: 'transparent',
                  border: `1px solid ${t.color.border}`,
                  borderRadius: t.radius.md,
                }}
              >
                <FilePlus size={13} />
                New draft
              </button>
              <button
                onClick={onNewBrief}
                className="inline-flex items-center cursor-pointer border-0"
                style={{
                  gap: t.space.xs,
                  padding: `${t.space.sm} ${t.space.md}`,
                  fontSize: t.size.ui,
                  fontWeight: t.weight.semibold,
                  color: t.color.bg,
                  backgroundColor: t.color.accent,
                  borderRadius: t.radius.md,
                }}
              >
                <Plus size={13} />
                New brief
              </button>
            </div>
          </div>
        ) : (
          <DocumentList documents={documents} onOpen={onOpen} />
        )}
      </div>
    </main>
  );
}

