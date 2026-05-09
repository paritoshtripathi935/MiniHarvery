/**
 * ThreadPicker — dropdown for switching between research threads in
 * the active matter. Replaces the always-visible threads panel.
 *
 * Structure:
 *   ┌─ Active thread title ──────────────  ▾ ┐    (closed)
 *   ┌─ search box ─────────────────────────  ┐    (open)
 *   │  Thread A · 3 turns · 2h ago          │
 *   │  Thread B · 1 turn  · 1d ago          │
 *   │  ─────────────                        │
 *   │  + New thread                         │
 *   └────────────────────────────────────────┘
 *
 * Designed for keyboard-first power users (Linear-style):
 *   - ↑/↓ to navigate
 *   - Enter selects
 *   - Esc closes
 *   - "/" while focused opens the picker
 */
import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import {
  ChevronDown,
  MessageSquareText,
  Plus,
  Search,
} from 'lucide-react';
import type { Message } from '../types';
import { useDismissable } from '../hooks/useDismissable';
import { t } from '../design/tokens';

interface Thread {
  id: string;
  title: string;
  lastTs: Date;
  turns: number;
}

function buildThreads(messages: Message[]): Thread[] {
  const byId = new Map<string, Thread>();
  for (const m of messages) {
    const prev = byId.get(m.threadId);
    if (prev) {
      prev.turns += 1;
      if (m.timestamp > prev.lastTs) prev.lastTs = m.timestamp;
    } else {
      byId.set(m.threadId, {
        id: m.threadId,
        title:
          (m.id.startsWith('placeholder:') ? m.query : m.query) || 'Untitled',
        lastTs: m.timestamp,
        turns: 1,
      });
    }
  }
  return [...byId.values()].sort((a, b) => b.lastTs.getTime() - a.lastTs.getTime());
}

function formatRelative(ts: Date): string {
  const ms = Date.now() - ts.getTime();
  if (ms < 60_000) return 'just now';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return ts.toLocaleDateString();
}

interface Props {
  messages: Message[];
  activeThreadId: string | null;
  onSelect: (threadId: string) => void;
  onNew: () => void;
}

export default function ThreadPicker({
  messages,
  activeThreadId,
  onSelect,
  onNew,
}: Props) {
  const threads = buildThreads(messages);
  const active = threads.find(t_ => t_.id === activeThreadId) ?? null;

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [cursor, setCursor] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setFilter('');
    setCursor(0);
  }, []);

  useDismissable(wrapRef, open, close);

  const visible = threads.filter(t_ =>
    t_.title.toLowerCase().includes(filter.toLowerCase()),
  );

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor(c => Math.min(c + 1, visible.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor(c => Math.max(c - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (cursor < visible.length) {
        onSelect(visible[cursor].id);
        close();
      } else {
        onNew();
        close();
      }
    } else if (e.key === 'Escape') {
      close();
    }
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center cursor-pointer border-0 bg-transparent"
        style={{
          gap: t.space.sm,
          padding: `${t.space.xs} ${t.space.sm}`,
          fontSize: t.size.ui,
          fontWeight: t.weight.medium,
          color: t.color.text,
          borderRadius: t.radius.sm,
          transition: t.motion.fast,
          maxWidth: '40ch',
        }}
      >
        <MessageSquareText size={13} style={{ color: t.color.dim }} />
        <span className="truncate">
          {active ? active.title : threads.length === 0 ? 'No threads yet' : 'Pick a thread'}
        </span>
        <ChevronDown size={12} style={{ color: t.color.dim }} />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-40 overflow-hidden"
          style={{
            width: '320px',
            backgroundColor: t.color.raised,
            border: `1px solid ${t.color.border}`,
            borderRadius: t.radius.md,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          }}
        >
          <div
            className="flex items-center"
            style={{
              gap: t.space.sm,
              padding: `${t.space.sm} ${t.space.md}`,
              borderBottom: `1px solid ${t.color.border}`,
            }}
          >
            <Search size={13} style={{ color: t.color.dim }} />
            <input
              autoFocus
              value={filter}
              onChange={e => {
                setFilter(e.target.value);
                setCursor(0);
              }}
              onKeyDown={handleKey}
              placeholder="Search threads…"
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: t.size.ui,
                color: t.color.text,
                fontFamily: 'inherit',
              }}
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {visible.length === 0 ? (
              <p
                className="m-0"
                style={{
                  padding: t.space.md,
                  fontSize: t.size.micro,
                  color: t.color.dim,
                  fontStyle: 'italic',
                }}
              >
                {threads.length === 0
                  ? 'No threads yet — ask a question below to begin.'
                  : 'No threads match.'}
              </p>
            ) : (
              visible.map((th, i) => {
                const isCursor = i === cursor;
                const isActive = th.id === activeThreadId;
                return (
                  <button
                    key={th.id}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => {
                      onSelect(th.id);
                      close();
                    }}
                    className="w-full text-left flex items-start cursor-pointer border-0"
                    style={{
                      gap: t.space.sm,
                      padding: `${t.space.sm} ${t.space.md}`,
                      backgroundColor: isCursor ? t.color.hover : 'transparent',
                      color: t.color.text,
                      transition: t.motion.fast,
                      borderLeft: isActive
                        ? `2px solid ${t.color.accent}`
                        : '2px solid transparent',
                    }}
                  >
                    <MessageSquareText
                      size={12}
                      style={{ color: t.color.dim, marginTop: 3, flexShrink: 0 }}
                    />
                    <span className="flex-1 min-w-0">
                      <span
                        className="block truncate"
                        style={{
                          fontSize: t.size.ui,
                          fontWeight: t.weight.medium,
                        }}
                      >
                        {th.title}
                      </span>
                      <span
                        className="block"
                        style={{ fontSize: t.size.micro, color: t.color.dim }}
                      >
                        {th.turns} {th.turns === 1 ? 'turn' : 'turns'} ·{' '}
                        {formatRelative(th.lastTs)}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <button
            onClick={() => {
              onNew();
              close();
            }}
            onMouseEnter={() => setCursor(visible.length)}
            className="w-full text-left flex items-center cursor-pointer border-0"
            style={{
              gap: t.space.sm,
              padding: `${t.space.sm} ${t.space.md}`,
              borderTop: `1px solid ${t.color.border}`,
              fontSize: t.size.ui,
              fontWeight: t.weight.medium,
              color: t.color.accent,
              backgroundColor:
                cursor === visible.length ? t.color.hover : 'transparent',
              transition: t.motion.fast,
            }}
          >
            <Plus size={12} />
            New thread
          </button>
        </div>
      )}
    </div>
  );
}
