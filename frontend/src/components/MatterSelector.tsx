/**
 * MatterSelector — header dropdown that names the matter the user is
 * currently working inside. Inbox is always pinned at the top of the list.
 *
 * Click the chip → menu of matters + "New matter…" CTA.
 * Picking a matter calls `onSelect(id)`; picking "New matter" opens an
 * inline name prompt (we keep it lightweight; no modal yet).
 */
import { useEffect, useRef, useState } from 'react';
import { Briefcase, ChevronDown, Plus, Inbox } from 'lucide-react';
import type { MatterSummary } from '../types';

interface Props {
  matters: MatterSummary[];
  activeMatterId: string | null;
  onSelect: (matterId: string) => void;
  onCreate: (title: string) => Promise<void>;
}

export default function MatterSelector({
  matters,
  activeMatterId,
  onSelect,
  onCreate,
}: Props) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const popRef = useRef<HTMLDivElement | null>(null);

  // Close on click-outside
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
        setDraftTitle('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const active = matters.find(m => m.id === activeMatterId) ?? null;

  const handleCreate = async () => {
    const title = draftTitle.trim();
    if (!title) return;
    await onCreate(title);
    setCreating(false);
    setDraftTitle('');
    setOpen(false);
  };

  return (
    <div className="relative" ref={popRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer border bg-transparent transition-colors"
        style={{
          backgroundColor: 'var(--surface-hover)',
          color: 'var(--text)',
          borderColor: 'var(--border)',
        }}
        title="Switch matter"
      >
        {active?.is_inbox ? <Inbox size={12} /> : <Briefcase size={12} />}
        <span className="truncate max-w-[14rem]">
          {active ? active.title : 'No matter'}
        </span>
        <ChevronDown size={12} style={{ color: 'var(--text-dim)' }} />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 w-72 rounded-md shadow-lg overflow-hidden z-50 border"
          style={{
            backgroundColor: 'var(--surface-raised)',
            borderColor: 'var(--border)',
          }}
        >
          <div className="max-h-72 overflow-y-auto">
            {matters.map(m => {
              const selected = m.id === activeMatterId;
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    onSelect(m.id);
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 flex items-start gap-2 cursor-pointer border-0 bg-transparent transition-colors hover:bg-[var(--surface-hover)]"
                  style={{
                    color: 'var(--text)',
                    backgroundColor: selected ? 'var(--surface-hover)' : 'transparent',
                  }}
                >
                  {m.is_inbox ? (
                    <Inbox size={13} style={{ color: 'var(--accent)', marginTop: 2 }} />
                  ) : (
                    <Briefcase size={13} style={{ color: 'var(--text-muted)', marginTop: 2 }} />
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-medium truncate">{m.title}</span>
                    <span className="block text-[10px]" style={{ color: 'var(--text-dim)' }}>
                      {m.thread_count} thread{m.thread_count === 1 ? '' : 's'} ·{' '}
                      {m.document_count} doc{m.document_count === 1 ? '' : 's'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <div
            className="border-t p-2"
            style={{ borderColor: 'var(--border)' }}
          >
            {creating ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={draftTitle}
                  onChange={e => setDraftTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') void handleCreate();
                    if (e.key === 'Escape') {
                      setCreating(false);
                      setDraftTitle('');
                    }
                  }}
                  placeholder="Matter title"
                  className="flex-1 px-2 py-1 text-xs rounded border outline-none"
                  style={{
                    backgroundColor: 'var(--surface)',
                    color: 'var(--text)',
                    borderColor: 'var(--border)',
                  }}
                />
                <button
                  onClick={() => void handleCreate()}
                  disabled={!draftTitle.trim()}
                  className="px-2 py-1 text-xs rounded cursor-pointer border-0 disabled:opacity-50"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--bg)' }}
                >
                  Create
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs cursor-pointer rounded border-0 bg-transparent transition-colors hover:bg-[var(--surface-hover)]"
                style={{ color: 'var(--accent)' }}
              >
                <Plus size={12} />
                New matter
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
