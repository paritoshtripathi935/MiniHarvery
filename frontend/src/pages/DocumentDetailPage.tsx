/**
 * DocumentDetailPage — full-page editor for a single document.
 *
 * URL pattern: /matters/:matterId/documents/:documentId
 *
 * The page is the whole document workspace:
 *   - Title is editable inline (click to rename).
 *   - Status pill toggles between Draft and Final.
 *   - Body comes from `DocumentRenderer` — type→component dispatch lives
 *     there, so adding `pleading_draft` is one branch in one file.
 *   - Source URL link sits in the header for quick verification.
 *   - Delete is in a `MoreMenu` — destructive actions never share visual
 *     weight with normal ones.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Loader2, Trash2 } from 'lucide-react';
import { useAuth, useUser } from '@clerk/clerk-react';
import {
  deleteDocument,
  getDocument,
  patchDocument,
} from '../services/api';
import type { DocumentRecord } from '../types';
import { useMatters } from '../state/MattersContext';
import { Breadcrumbs, Crumb } from '../layout/Breadcrumbs';
import DocumentRenderer from '../components/DocumentRenderer';
import EditableTitle from '../components/EditableTitle';
import MoreMenu from '../components/MoreMenu';
import { t } from '../design/tokens';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function DocumentDetailPage() {
  const { matterId = '', documentId = '' } = useParams<{
    matterId: string;
    documentId: string;
  }>();
  const navigate = useNavigate();
  const { user } = useUser();
  const { getToken } = useAuth();
  const { matters, refresh: refreshMatters } = useMatters();
  const getAuthToken = useCallback(() => getToken(), [getToken]);

  const matterSummary = matters.find(m => m.id === matterId) ?? null;

  const [doc, setDoc] = useState<DocumentRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!documentId) return;
    let cancelled = false;
    setDoc(null);
    setError(null);

    (async () => {
      try {
        const d = await getDocument(documentId, user?.id, getAuthToken);
        if (!cancelled) setDoc(d);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load document');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId, user?.id, getAuthToken]);

  // ── Save helpers ─────────────────────────────────────────────────────────
  const persist = useCallback(
    async (fields: {
      title?: string;
      content?: Record<string, unknown>;
      status?: 'draft' | 'final';
    }) => {
      if (!documentId) return;
      setSaveStatus('saving');
      try {
        const next = await patchDocument(documentId, fields, user?.id, getAuthToken);
        setDoc(next);
        setSaveStatus('saved');
        window.setTimeout(() => {
          setSaveStatus(s => (s === 'saved' ? 'idle' : s));
        }, 1800);
      } catch (e: unknown) {
        console.warn('document save failed:', e);
        setSaveStatus('error');
      }
    },
    [documentId, user?.id, getAuthToken],
  );

  const onContentChange = useCallback(
    (next: Record<string, unknown>) => persist({ content: next }),
    [persist],
  );

  const onTitleCommit = useCallback(
    async (next: string) => {
      const trimmed = next.trim();
      if (!trimmed || !doc || trimmed === doc.title) return;
      await persist({ title: trimmed });
    },
    [persist, doc],
  );

  const onToggleStatus = useCallback(async () => {
    if (!doc) return;
    const next = doc.status === 'final' ? 'draft' : 'final';
    await persist({ status: next });
  }, [persist, doc]);

  const onDelete = useCallback(async () => {
    if (!doc) return;
    if (!window.confirm(`Delete "${doc.title}"? This can't be undone from the UI.`)) {
      return;
    }
    try {
      await deleteDocument(doc.id, user?.id, getAuthToken);
      void refreshMatters();
      navigate(`/matters/${matterId}`);
    } catch (e: unknown) {
      console.warn('delete failed:', e);
    }
  }, [doc, user?.id, getAuthToken, refreshMatters, matterId, navigate]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{ padding: t.space.xl, color: t.color.danger }}>
        Could not load document: {error}{' '}
        <button
          onClick={() => navigate(`/matters/${matterId}`)}
          style={{
            color: t.color.accent,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          ← Back to matter
        </button>
      </div>
    );
  }
  if (!doc) {
    return (
      <div
        style={{
          padding: t.space.xl,
          color: t.color.muted,
          fontSize: t.size.body,
        }}
      >
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Breadcrumbs>
        <Crumb to={matterSummary?.is_inbox ? '/' : '/matters'}>
          {matterSummary?.is_inbox ? 'Today' : 'Matters'}
        </Crumb>
        <Crumb to={`/matters/${matterId}`}>
          {matterSummary?.title ?? 'Matter'}
        </Crumb>
        <Crumb>{doc.title}</Crumb>
      </Breadcrumbs>

      <DocumentHeader
        doc={doc}
        saveStatus={saveStatus}
        onTitleCommit={onTitleCommit}
        onToggleStatus={onToggleStatus}
        onDelete={onDelete}
        onBack={() => navigate(`/matters/${matterId}`)}
      />

      <div
        className="flex-1 overflow-y-auto"
        style={{
          backgroundColor: t.color.bg,
          padding: `${t.space.lg} ${t.space.xl}`,
        }}
      >
        <article style={{ maxWidth: '780px', margin: '0 auto' }}>
          <DocumentRenderer doc={doc} onContentChange={onContentChange} />
        </article>
      </div>
    </div>
  );
}

// ─── Header ────────────────────────────────────────────────────────────────

function DocumentHeader({
  doc,
  saveStatus,
  onTitleCommit,
  onToggleStatus,
  onDelete,
  onBack,
}: {
  doc: DocumentRecord;
  saveStatus: SaveStatus;
  onTitleCommit: (next: string) => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  onBack: () => void;
}) {
  return (
    <header
      className="flex items-center flex-shrink-0"
      style={{
        gap: t.space.md,
        padding: `${t.space.md} ${t.space.lg}`,
        backgroundColor: t.color.surface,
        borderBottom: `1px solid ${t.color.border}`,
      }}
    >
      <button
        onClick={onBack}
        className="cursor-pointer border-0 bg-transparent flex items-center justify-center"
        style={{
          width: '32px',
          height: '32px',
          borderRadius: t.radius.sm,
          color: t.color.muted,
          transition: t.motion.fast,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.backgroundColor = t.color.hover;
          e.currentTarget.style.color = t.color.text;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.color = t.color.muted;
        }}
        title="Back to matter"
      >
        <ArrowLeft size={16} />
      </button>

      <span
        style={{
          padding: `2px ${t.space.sm}`,
          fontSize: t.size.micro,
          fontWeight: t.weight.semibold,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: t.color.bg,
          backgroundColor: t.color.accent,
          borderRadius: t.radius.sm,
        }}
      >
        {labelForType(doc.type)}
      </span>

      <EditableTitle title={doc.title} onCommit={onTitleCommit} />

      <SaveIndicator status={saveStatus} />

      <div className="flex items-center" style={{ gap: t.space.sm, marginLeft: 'auto' }}>
        {doc.source_url && (
          <a
            href={doc.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="no-underline inline-flex items-center"
            style={{
              gap: t.space.xs,
              padding: `${t.space.xs} ${t.space.sm}`,
              fontSize: t.size.ui,
              color: t.color.muted,
              borderRadius: t.radius.sm,
              transition: t.motion.fast,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = t.color.text;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = t.color.muted;
            }}
            title={doc.source_url}
          >
            Source <ExternalLink size={11} />
          </a>
        )}

        <StatusPill status={doc.status} onToggle={onToggleStatus} />

        <MoreMenu
          items={[
            {
              label: 'Delete document',
              onClick: onDelete,
              danger: true,
              icon: Trash2,
            },
          ]}
        />
      </div>
    </header>
  );
}

function StatusPill({
  status,
  onToggle,
}: {
  status: 'draft' | 'final';
  onToggle: () => void;
}) {
  const isFinal = status === 'final';
  return (
    <button
      onClick={onToggle}
      className="cursor-pointer border-0 inline-flex items-center"
      style={{
        gap: t.space.xs,
        padding: `${t.space.xs} ${t.space.sm}`,
        fontSize: t.size.micro,
        fontWeight: t.weight.semibold,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: isFinal ? t.color.bg : t.color.muted,
        backgroundColor: isFinal ? t.color.accent : t.color.hover,
        borderRadius: t.radius.pill,
        transition: t.motion.fast,
      }}
      title={isFinal ? 'Click to mark as draft' : 'Click to mark as final'}
    >
      {isFinal ? 'Final' : 'Draft'}
    </button>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;
  if (status === 'saving') {
    return (
      <span
        className="inline-flex items-center"
        style={{ gap: t.space.xs, fontSize: t.size.micro, color: t.color.dim }}
      >
        <Loader2 size={11} className="animate-spin" />
        Saving…
      </span>
    );
  }
  if (status === 'saved') {
    return (
      <span style={{ fontSize: t.size.micro, color: t.color.dim }}>Saved</span>
    );
  }
  return (
    <span style={{ fontSize: t.size.micro, color: t.color.danger }}>
      Save failed — your last edit may not be persisted.
    </span>
  );
}

function labelForType(type: string): string {
  return (
    {
      case_brief: 'Case Brief',
      pleading_draft: 'Draft',
      authorities_table: 'Authorities',
      note: 'Note',
    }[type] ?? type
  );
}
