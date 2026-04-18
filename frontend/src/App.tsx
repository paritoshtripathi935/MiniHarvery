/**
 * Root component — MiniHarvey Research Workbench.
 * Replaces the vertical chat log with a three-pane layout:
 *   Threads (left) · Brief (center) · Sources + Workbook (right).
 */
import { useState, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Scale, LogOut } from 'lucide-react';
import { SignedIn, SignedOut, UserButton, useUser } from '@clerk/clerk-react';
import { useGuest } from './hooks/useGuest';
import { performLegalSearch, getLegalAnswer, clearSession } from './services/api';
import type { Message, Citation, QueryType, LegalSearchResult, VideoResult } from './types';
import SearchBar from './components/SearchBar';
import Brief from './components/Brief';
import LeftSidebar from './components/LeftSidebar';
import SourcesPanel from './components/SourcesPanel';
import DisclaimerFooter from './components/DisclaimerFooter';
import DevBanner from './components/DevBanner';
import ThemeToggle from './components/ThemeToggle';
import LoginPage from './components/LoginPage';
import { useTheme } from './hooks/useTheme';

export default function App() {
  // Mount the theme hook once at the root so the data-theme attribute is
  // applied on first paint (before any child subscribes).
  useTheme();

  const { isGuest } = useGuest();

  // Guest mode bypasses Clerk entirely — the workbench still renders because
  // every user_id path in the app already treats the id as optional.
  if (isGuest) return <AuthenticatedApp />;

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
  const { isGuest, exitGuest } = useGuest();
  const [sessionId] = useState<string>(() => uuidv4());
  const [messages, setMessages] = useState<Message[]>([]);
  // activeThreadId:
  //   'new'  → user clicked "New matter" — render a blank slate
  //   null   → initial load — default to the most recent thread
  //   <uuid> → that thread is selected
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Pinned source URLs + a snapshot of the results so pins survive thread switches
  const [pinnedUrls, setPinnedUrls] = useState<Set<string>>(new Set());
  const [pinnedResults, setPinnedResults] = useState<LegalSearchResult[]>([]);
  const [flashUrl, setFlashUrl] = useState<string | undefined>(undefined);

  // Sidebar collapse state — either pane can be minimized to a thin icon rail
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  /**
   * Resolve the currently-displayed thread. A thread is the ordered list of
   * all messages sharing the same threadId. Follow-up questions reuse the
   * parent's threadId so they stack inside the Brief as one conversation.
   */
  const activeThread = useMemo<Message[]>(() => {
    if (activeThreadId === 'new') return [];
    if (activeThreadId) {
      const inThread = messages.filter(m => m.threadId === activeThreadId);
      if (inThread.length > 0) return inThread;
    }
    // Fallback: the most recently started thread
    const latest = messages[messages.length - 1];
    if (!latest) return [];
    return messages.filter(m => m.threadId === latest.threadId);
  }, [messages, activeThreadId]);

  // Latest message in the active thread — powers the right panel (Sources/Videos)
  // so it reflects what was searched on the most recent turn.
  const latestTurn = activeThread[activeThread.length - 1];

  /**
   * Run a query.
   *
   * @param query        the user's question
   * @param parentThread if provided, this is a follow-up — reuse the thread id
   *                     so it stacks inside the current conversation. Otherwise
   *                     a fresh thread is minted and becomes the active one.
   */
  const handleSearch = async (query: string, parentThread?: string) => {
    if (!query.trim() || isLoading) return;

    const msgId = uuidv4();
    const threadId = parentThread ?? uuidv4();
    setMessages(prev => [
      ...prev,
      {
        id: msgId,
        threadId,
        query,
        search_results: [],
        videos: [],
        isSearching: true,
        isAnswering: false,
        streamingText: '',
        timestamp: new Date(),
      },
    ]);
    setActiveThreadId(threadId);
    setIsLoading(true);

    try {
      // Step 1 — legal search + video search (run in parallel server-side)
      const { results, videos, query_type } = await performLegalSearch(
        sessionId,
        query,
        user?.id,
      );
      setMessages(prev =>
        prev.map(m =>
          m.id === msgId
            ? {
                ...m,
                search_results: results,
                videos: videos as VideoResult[],
                isSearching: false,
                isAnswering: true,
              }
            : m,
        ),
      );

      // Step 2 — streaming answer
      await getLegalAnswer(
        sessionId,
        query,
        (chunk: string) => {
          setMessages(prev =>
            prev.map(m =>
              m.id === msgId ? { ...m, streamingText: (m.streamingText ?? '') + chunk } : m,
            ),
          );
        },
        (citations: Citation[], suggested_steps: string[]) => {
          setMessages(prev =>
            prev.map(m => {
              if (m.id !== msgId) return m;
              return {
                ...m,
                isAnswering: false,
                streamingText: undefined,
                answer: {
                  content: m.streamingText ?? '',
                  citations,
                  suggested_steps,
                  query_type: query_type as QueryType,
                },
              };
            }),
          );
          setIsLoading(false);
        },
        (error: string) => {
          setMessages(prev =>
            prev.map(m =>
              m.id === msgId
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

  /** Click on a citation chip in the Brief → flash the matching source card */
  const handleCitationClick = (citation: Citation, results: LegalSearchResult[]) => {
    // Try to match by citation text against result.citation or result.title
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
    // Sentinel so activeThread resolves to [] (blank slate). Cleared the
    // moment handleSearch mints a fresh threadId.
    setActiveThreadId('new');
  };

  const handleClearAll = async () => {
    await clearSession(sessionId);
    setMessages([]);
    setActiveThreadId(null);
    setPinnedUrls(new Set());
    setPinnedResults([]);
  };

  return (
    <div
      className="flex flex-col h-screen"
      style={{ backgroundColor: 'var(--bg)' }}
    >
      {/* Live "under development" ticker — sits above the header */}
      <DevBanner />

      {/* Header */}
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
              MiniHarvey
            </h1>
            <p className="text-[10px] m-0" style={{ color: 'var(--text-muted)' }}>
              Research Workbench · Indian Legal AI
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {isGuest ? (
            <button
              onClick={exitGuest}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer border transition-colors"
              style={{
                backgroundColor: 'var(--surface-hover)',
                color: 'var(--text-muted)',
                borderColor: 'var(--border)',
              }}
              title="Exit guest mode and return to sign-in"
            >
              <span
                className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-widest"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--bg)',
                  letterSpacing: '0.15em',
                }}
              >
                Guest
              </span>
              <span>Exit</span>
              <LogOut size={12} />
            </button>
          ) : (
            <UserButton afterSignOutUrl="/" />
          )}
        </div>
      </header>

      {/* Three-pane workbench — side panes extend full height */}
      <div className="flex-1 flex overflow-hidden">
        <LeftSidebar
          messages={messages}
          activeThreadId={activeThreadId === 'new' ? null : activeThread[0]?.threadId ?? null}
          onSelectThread={setActiveThreadId}
          onNew={handleNewThread}
          onClear={handleClearAll}
          pinnedResults={pinnedResults}
          onTogglePin={handleTogglePin}
          flashUrl={flashUrl}
          collapsed={leftCollapsed}
          onToggleCollapsed={() => setLeftCollapsed(v => !v)}
        />

        {/* Center column = Brief + composer stacked */}
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

          {/* Composer — tucked under the Brief, aligned to the center pane.
              Sends stay in-thread when there's an active thread, so the
              bottom composer behaves like a chat follow-up. "New matter"
              resets to a fresh thread. */}
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

      {/* Global disclaimer + developer credit — spans full width */}
      <div className="flex-shrink-0" style={{ backgroundColor: 'var(--bg)' }}>
        <DisclaimerFooter />
      </div>

      {/* Keyframe for source-card flash on citation click */}
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
