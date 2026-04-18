/**
 * Left sidebar — Threads (top) and Workbook (bottom).
 * Each section can be individually minimized (header only) or expanded.
 * The entire sidebar can also be collapsed to a thin icon rail.
 */
import { useMemo, useState } from 'react';
import {
  MessageSquareText,
  Plus,
  Trash2,
  PanelLeftClose,
  BookMarked,
  ChevronDown,
} from 'lucide-react';
import type { Message, LegalSearchResult } from '../types';
import CaseCard from './CaseCard';
import CollapsedRail from './CollapsedRail';

interface Props {
  messages: Message[];
  /** Currently-selected thread id (or null for none / new matter). */
  activeThreadId: string | null;
  /** Select a thread by its id — ALL messages in that thread show in the Brief. */
  onSelectThread: (threadId: string) => void;
  onNew: () => void;
  onClear: () => void;
  pinnedResults: LegalSearchResult[];
  onTogglePin: (url: string, result: LegalSearchResult) => void;
  flashUrl?: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

/** A conversation — the first message plus any follow-ups, sharing a threadId. */
interface Thread {
  threadId: string;
  root: Message;      // first message of the thread (its query = thread title)
  turns: Message[];   // all messages in order
  lastTs: Date;       // for sorting threads by recency
}

function groupIntoThreads(messages: Message[]): Thread[] {
  const byId = new Map<string, Thread>();
  for (const m of messages) {
    const t = byId.get(m.threadId);
    if (t) {
      t.turns.push(m);
      if (m.timestamp > t.lastTs) t.lastTs = m.timestamp;
    } else {
      byId.set(m.threadId, {
        threadId: m.threadId,
        root: m,
        turns: [m],
        lastTs: m.timestamp,
      });
    }
  }
  // Newest thread first
  return [...byId.values()].sort((a, b) => b.lastTs.getTime() - a.lastTs.getTime());
}

function formatTime(ts: Date): string {
  const now = Date.now();
  const diff = now - ts.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return ts.toLocaleDateString();
}

// Small reusable toggle chevron — rotates based on open state
function SectionToggle({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="p-1 rounded cursor-pointer border-0 bg-transparent transition-colors hover:bg-[var(--surface-hover)]"
      style={{ color: 'var(--text-dim)' }}
      title={open ? `Collapse ${label}` : `Expand ${label}`}
      aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
      aria-expanded={open}
    >
      <ChevronDown
        size={13}
        style={{
          transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
          transition: 'transform 180ms',
        }}
      />
    </button>
  );
}

export default function LeftSidebar({
  messages,
  activeThreadId,
  onSelectThread,
  onNew,
  onClear,
  pinnedResults,
  onTogglePin,
  flashUrl,
  collapsed,
  onToggleCollapsed,
}: Props) {
  const [threadsOpen, setThreadsOpen] = useState(true);
  const [workbookOpen, setWorkbookOpen] = useState(true);

  const threads = useMemo(() => groupIntoThreads(messages), [messages]);

  if (collapsed) {
    return (
      <CollapsedRail
        side="left"
        onExpand={onToggleCollapsed}
        sections={[
          { icon: MessageSquareText, label: 'Threads', count: threads.length },
          {
            icon: BookMarked,
            label: 'Workbook',
            count: pinnedResults.length,
            accent: 'var(--accent)',
          },
        ]}
      />
    );
  }

  // flex basis: expanded section takes the free space; collapsed section shows header only.
  // Both open → 50/50; one open → it fills; both collapsed → just two headers stacked.
  const threadsFlex = threadsOpen ? '1 1 0' : '0 0 auto';
  const workbookFlex = workbookOpen ? '1 1 0' : '0 0 auto';

  return (
    <aside
      className="flex flex-col h-full overflow-hidden border-r"
      style={{
        width: '280px',
        backgroundColor: 'var(--surface)',
        borderColor: 'var(--border)',
      }}
    >
      {/* ─── Threads ─────────────────────────────────────────────── */}
      <div className="flex flex-col min-h-0" style={{ flex: threadsFlex }}>
        <header
          className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <SectionToggle open={threadsOpen} onClick={() => setThreadsOpen(v => !v)} label="Threads" />
            <span
              className="text-[11px] font-semibold uppercase tracking-widest"
              style={{ color: 'var(--text-muted)', letterSpacing: '0.15em' }}
            >
              Threads
            </span>
            {!threadsOpen && threads.length > 0 && (
              <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
                · {threads.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onNew}
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium cursor-pointer border-0 transition-colors"
              style={{ backgroundColor: 'var(--surface-hover)', color: 'var(--accent)' }}
              title="Start a new matter"
            >
              <Plus size={11} />
              New
            </button>
            <button
              onClick={onToggleCollapsed}
              className="p-1 rounded cursor-pointer border-0 bg-transparent transition-colors hover:bg-[var(--surface-hover)]"
              style={{ color: 'var(--text-dim)' }}
              title="Collapse panel"
              aria-label="Collapse left panel"
            >
              <PanelLeftClose size={13} />
            </button>
          </div>
        </header>

        {threadsOpen && (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2">
              {threads.length === 0 ? (
                <p
                  className="text-[11px] italic px-3 py-6 text-center"
                  style={{ color: 'var(--text-dim)' }}
                >
                  No threads yet. Ask a question below to begin.
                </p>
              ) : (
                <ul className="space-y-1 m-0 p-0" style={{ listStyle: 'none' }}>
                  {threads.map(thread => {
                    const active = thread.threadId === activeThreadId;
                    // Count sources across every turn in the thread
                    const sourceCount = thread.turns.reduce(
                      (acc, t) => acc + t.search_results.length,
                      0,
                    );
                    const turnCount = thread.turns.length;
                    return (
                      <li key={thread.threadId}>
                        <button
                          onClick={() => onSelectThread(thread.threadId)}
                          className="w-full text-left px-3 py-2 rounded-md cursor-pointer border-0 transition-colors"
                          style={{
                            backgroundColor: active ? 'var(--surface-hover)' : 'transparent',
                            borderLeft: active
                              ? '2px solid var(--accent)'
                              : '2px solid transparent',
                          }}
                        >
                          <div className="flex items-start gap-2">
                            <MessageSquareText
                              size={12}
                              className="flex-shrink-0 mt-0.5"
                              style={{ color: active ? 'var(--accent)' : 'var(--text-dim)' }}
                            />
                            <div className="flex-1 min-w-0">
                              <p
                                className="text-xs font-medium line-clamp-2 leading-snug m-0"
                                style={{ color: active ? 'var(--text)' : 'var(--text-secondary)' }}
                              >
                                {thread.root.query}
                              </p>
                              <p
                                className="text-[10px] mt-0.5 m-0"
                                style={{ color: 'var(--text-dim)' }}
                              >
                                {formatTime(thread.lastTs)}
                                {turnCount > 1 && (
                                  <>
                                    {' · '}
                                    {turnCount} turns
                                  </>
                                )}
                                {sourceCount > 0 && (
                                  <>
                                    {' · '}
                                    {sourceCount} source{sourceCount === 1 ? '' : 's'}
                                  </>
                                )}
                              </p>
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {threads.length > 0 && (
              <footer
                className="flex-shrink-0 px-3 py-2 border-t"
                style={{ borderColor: 'var(--border)' }}
              >
                <button
                  onClick={onClear}
                  className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded text-[11px] cursor-pointer border-0 transition-colors hover:bg-[var(--surface-hover)]"
                  style={{ color: 'var(--text-muted)', backgroundColor: 'transparent' }}
                >
                  <Trash2 size={11} />
                  Clear all threads
                </button>
              </footer>
            )}
          </>
        )}
      </div>

      {/* ─── Workbook ────────────────────────────────────────────── */}
      <div
        className="flex flex-col min-h-0 border-t"
        style={{ flex: workbookFlex, borderColor: 'var(--border)' }}
      >
        <header
          className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <SectionToggle open={workbookOpen} onClick={() => setWorkbookOpen(v => !v)} label="Workbook" />
            <BookMarked size={12} style={{ color: 'var(--accent)' }} />
            <span
              className="text-[11px] font-semibold uppercase tracking-widest"
              style={{ color: 'var(--accent)', letterSpacing: '0.15em' }}
            >
              Workbook
            </span>
          </div>
          <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
            {pinnedResults.length} pinned
          </span>
        </header>

        {workbookOpen && (
          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2">
            {pinnedResults.length === 0 ? (
              <p
                className="text-[11px] italic px-2 py-3 text-center"
                style={{ color: 'var(--text-dim)' }}
              >
                Pin cases and statutes to build your case file.
              </p>
            ) : (
              pinnedResults.map(result => (
                <CaseCard
                  key={result.url}
                  result={result}
                  pinned
                  onTogglePin={url => onTogglePin(url, result)}
                  flash={flashUrl === result.url}
                />
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
