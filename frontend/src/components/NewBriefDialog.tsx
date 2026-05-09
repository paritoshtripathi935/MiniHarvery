/**
 * NewBriefDialog — captures input for creating a Case Brief. Two modes:
 *
 *   1. URL mode (default): paste an Indian Kanoon / India Code / SCI URL.
 *      Backend fetches + extracts before LLM.
 *   2. Text mode: paste the judgment text directly. Useful when the URL is
 *      paywalled (SCC, Manupatra), the user already has a PDF dump, or
 *      Indian Kanoon is rate-limiting fetches.
 *
 * On success the parent gets the new document and is responsible for
 * navigation. We don't navigate inline because the dialog can open from
 * places that don't want to leave (e.g. "Save as brief" mid-research).
 */
import { useEffect, useState } from 'react';
import { Loader2, Link2, Type } from 'lucide-react';
import type { CaseBriefDocument } from '../types';
import Dialog from './Dialog';
import { Field, TextArea, TextInput } from './Field';
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

  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setError(null);
    setMode('url');
    setUrl(seedUrl ?? '');
    setText('');
    setTitle(seedTitle ?? '');
  }, [open, seedUrl, seedTitle]);

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
    <Dialog
      open={open}
      busy={busy}
      title="New case brief"
      subtitle="Vidhi will extract the judgment, structure it, and save it to this matter."
      onClose={onClose}
      footer={
        <>
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
        </>
      }
    >
      <ModeToggle mode={mode} onChange={setMode} />

      {mode === 'url' ? (
        <Field label="Judgment URL" htmlFor="brief-url">
          <TextInput
            id="brief-url"
            autoFocus
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://indiankanoon.org/doc/…"
            disabled={busy}
          />
        </Field>
      ) : (
        <Field label="Paste judgment text" htmlFor="brief-text">
          <TextArea
            id="brief-text"
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Paste the full judgment text here. The longer the source, the richer the brief."
            disabled={busy}
            rows={10}
          />
        </Field>
      )}

      <Field
        label="Document title (optional)"
        htmlFor="brief-title"
        hint="If left blank, Vidhi uses the case citation."
      >
        <TextInput
          id="brief-title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Samar Ghosh v Jaya Ghosh"
          disabled={busy}
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
    </Dialog>
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
