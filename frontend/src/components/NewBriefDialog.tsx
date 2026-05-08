/**
 * NewBriefDialog — small modal that captures input for creating a Case
 * Brief. Two modes:
 *
 *   1. URL mode (default): paste an Indian Kanoon / India Code / SCI URL.
 *      Backend fetches + extracts before LLM.
 *   2. Text mode: paste the judgment text directly. Useful when:
 *        - the URL is paywalled (SCC, Manupatra, etc.)
 *        - the user already has a PDF dump from somewhere
 *        - Indian Kanoon is rate-limiting fetches
 *
 * On success the *parent* gets the new document and is responsible for
 * navigation. We don't navigate inline because the dialog can be opened
 * from places that can't / don't want to leave (e.g. a "Save as brief"
 * button mid-research that wants to stay on the matter page).
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2, X, Link2, Type } from 'lucide-react';
import type { CaseBriefDocument } from '../types';
import { t } from '../design/tokens';

interface Props {
  open: boolean;
  /** Prefill (e.g. when launched from a Source card's "Save as brief"). */
  seedUrl?: string;
  seedTitle?: string;
  seedQueryId?: string;
  onClose: () => void;
  onGenerate: (input: {
    url?: string;
    text?: string;
    title?: string;
    query_id?: string;
  }) => Promise<CaseBriefDocument>;
  onCreated: (doc: CaseBriefDocument) => void;
}

type Mode = 'url' | 'text';

export default function NewBriefDialog({
  open,
  seedUrl,
  seedTitle,
  seedQueryId,
  onClose,
  onGenerate,
  onCreated,
}: Props) {
  const [mode, setMode] = useState<Mode>('url');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // When the dialog opens with seed data, prefill and pick the right mode.
  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setError(null);
    setMode(seedUrl ? 'url' : 'url');
    setUrl(seedUrl ?? '');
    setText('');
    setTitle(seedTitle ?? '');
  }, [open, seedUrl, seedTitle]);

  // Esc closes; click-outside closes (only when not busy — losing an
  // in-flight LLM call by accident is annoying).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    const onDoc = (e: MouseEvent) => {
      if (busy) return;
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDoc);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDoc);
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  const submit = async () => {
    if (busy) return;
    if (mode === 'url' && !url.trim()) {
      setError('Paste a URL or switch to text mode.');
      return;
    }
    if (mode === 'text' && !text.trim()) {
      setError('Paste the judgment text or switch to URL mode.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const doc = await onGenerate({
        url: mode === 'url' ? url.trim() : undefined,
        text: mode === 'text' ? text.trim() : undefined,
        title: title.trim() || undefined,
        query_id: seedQueryId,
      });
      onCreated(doc);
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : 'Brief generation failed. Try a different source.',
      );
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-24 px-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div
        ref={cardRef}
        className="w-full max-w-xl rounded-lg overflow-hidden"
        style={{
          backgroundColor: t.color.raised,
          border: `1px solid ${t.color.border}`,
          boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
        }}
      >
        <header
          className="flex items-center"
          style={{
            padding: `${t.space.md} ${t.space.lg}`,
            borderBottom: `1px solid ${t.color.border}`,
            gap: t.space.sm,
          }}
        >
          <div className="flex-1 min-w-0">
            <h2
              className="serif m-0"
              style={{
                fontSize: t.size.h2,
                fontWeight: t.weight.semibold,
                color: t.color.text,
                letterSpacing: '-0.005em',
              }}
            >
              New case brief
            </h2>
            <p
              className="m-0"
              style={{
                fontSize: t.size.ui,
                color: t.color.muted,
                marginTop: '2px',
              }}
            >
              Vidhi will extract the judgment, structure it, and save it to this
              matter.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="cursor-pointer border-0 bg-transparent disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              padding: t.space.xs,
              color: t.color.muted,
              borderRadius: t.radius.sm,
            }}
          >
            <X size={16} />
          </button>
        </header>

        <div style={{ padding: t.space.lg }}>
          <ModeToggle mode={mode} onChange={setMode} />

          {mode === 'url' ? (
            <Field label="Judgment URL" htmlFor="brief-url">
              <input
                id="brief-url"
                autoFocus
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://indiankanoon.org/doc/…"
                disabled={busy}
                style={inputStyle}
              />
            </Field>
          ) : (
            <Field label="Paste judgment text" htmlFor="brief-text">
              <textarea
                id="brief-text"
                autoFocus
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Paste the full judgment text here. The longer the source, the richer the brief."
                disabled={busy}
                rows={10}
                style={{ ...inputStyle, resize: 'vertical', minHeight: '180px' }}
              />
            </Field>
          )}

          <Field
            label="Document title (optional)"
            htmlFor="brief-title"
            hint="If left blank, Vidhi uses the case citation."
          >
            <input
              id="brief-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Samar Ghosh v Jaya Ghosh"
              disabled={busy}
              style={inputStyle}
            />
          </Field>

          {error && (
            <p
              className="m-0"
              style={{
                marginTop: t.space.sm,
                fontSize: t.size.ui,
                color: t.color.danger,
              }}
            >
              {error}
            </p>
          )}
        </div>

        <footer
          className="flex items-center justify-end"
          style={{
            gap: t.space.sm,
            padding: `${t.space.md} ${t.space.lg}`,
            borderTop: `1px solid ${t.color.border}`,
            backgroundColor: t.color.surface,
          }}
        >
          <button
            onClick={onClose}
            disabled={busy}
            className="cursor-pointer border-0 bg-transparent disabled:cursor-not-allowed"
            style={{
              padding: `${t.space.sm} ${t.space.md}`,
              fontSize: t.size.ui,
              fontWeight: t.weight.medium,
              color: t.color.muted,
              borderRadius: t.radius.sm,
              opacity: busy ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={busy}
            className="inline-flex items-center cursor-pointer border-0 disabled:cursor-not-allowed"
            style={{
              gap: t.space.xs,
              padding: `${t.space.sm} ${t.space.md}`,
              fontSize: t.size.ui,
              fontWeight: t.weight.semibold,
              color: t.color.bg,
              backgroundColor: busy ? t.color.muted : t.color.accent,
              borderRadius: t.radius.sm,
              transition: t.motion.fast,
            }}
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            {busy ? 'Generating…' : 'Generate brief'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
}) {
  return (
    <div
      className="flex"
      style={{
        gap: '2px',
        padding: '2px',
        backgroundColor: t.color.surface,
        border: `1px solid ${t.color.border}`,
        borderRadius: t.radius.md,
        marginBottom: t.space.md,
        width: 'fit-content',
      }}
    >
      <ModeButton
        icon={Link2}
        label="From URL"
        active={mode === 'url'}
        onClick={() => onChange('url')}
      />
      <ModeButton
        icon={Type}
        label="From text"
        active={mode === 'text'}
        onClick={() => onChange('text')}
      />
    </div>
  );
}

function ModeButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center cursor-pointer border-0"
      style={{
        gap: t.space.xs,
        padding: `${t.space.xs} ${t.space.sm}`,
        fontSize: t.size.ui,
        fontWeight: t.weight.medium,
        color: active ? t.color.text : t.color.muted,
        backgroundColor: active ? t.color.hover : 'transparent',
        borderRadius: t.radius.sm,
        transition: t.motion.fast,
      }}
    >
      <Icon size={12} style={{ color: active ? t.color.accent : t.color.dim }} />
      {label}
    </button>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: t.space.md }}>
      <label
        htmlFor={htmlFor}
        style={{
          display: 'block',
          fontSize: t.size.micro,
          fontWeight: t.weight.semibold,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: t.color.muted,
          marginBottom: t.space.xs,
        }}
      >
        {label}
      </label>
      {children}
      {hint && (
        <p
          className="m-0"
          style={{
            fontSize: t.size.micro,
            color: t.color.dim,
            marginTop: t.space.xs,
          }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  fontFamily: 'inherit',
  fontSize: t.size.body,
  color: t.color.text,
  backgroundColor: t.color.surface,
  border: `1px solid ${t.color.border}`,
  borderRadius: t.radius.sm,
  padding: `${t.space.sm} ${t.space.md}`,
  outline: 'none',
  transition: 'border-color 120ms',
};
