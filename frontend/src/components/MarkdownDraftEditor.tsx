/**
 * MarkdownDraftEditor — full-page editor for a generated pleading draft.
 *
 * Two modes via a tab toggle at the top: Edit (textarea over the raw
 * Markdown) and Preview (rendered via react-markdown). The 780px
 * content column makes split-pane cramped, so we toggle instead.
 *
 * Auto-saves the markdown via `useDebouncedSave` (600ms, matching the
 * case-brief editor). The page-level title / status / source-link
 * controls still live on DocumentDetailPage.
 */
import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Pencil, Eye } from 'lucide-react';
import type { PleadingDraftContent } from '../types';
import { useDebouncedSave } from '../hooks/useDebouncedSave';
import { t } from '../design/tokens';

type Mode = 'edit' | 'preview';

interface Props {
  content: PleadingDraftContent;
  onSave: (next: PleadingDraftContent) => Promise<void>;
}

export default function MarkdownDraftEditor({ content, onSave }: Props) {
  const [markdown, setMarkdown] = useState(content.markdown);
  const [mode, setMode] = useState<Mode>('edit');

  // Reset on document switch — local is source of truth while editing the
  // same doc, so don't reconcile on every prop tick (debounced saves come
  // back via the parent and would clobber an in-flight edit).
  useEffect(() => {
    setMarkdown(content.markdown);
  }, [content.template_id, content.generated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const queueSave = useDebouncedSave<string>(async next => {
    await onSave({ ...content, markdown: next });
  }, 600);

  const update = (next: string) => {
    setMarkdown(next);
    queueSave(next);
  };

  return (
    <div>
      <ModeToggle mode={mode} onChange={setMode} />
      {mode === 'edit' ? (
        <Editor value={markdown} onChange={update} />
      ) : (
        <Preview markdown={markdown} />
      )}
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
      role="tablist"
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
        icon={Pencil}
        label="Edit"
        active={mode === 'edit'}
        onClick={() => onChange('edit')}
      />
      <ModeButton
        icon={Eye}
        label="Preview"
        active={mode === 'preview'}
        onClick={() => onChange('preview')}
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
      role="tab"
      aria-selected={active}
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

function Editor({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  // Auto-grow with content. min 60vh so the user has runway on a fresh draft.
  const [rows, setRows] = useState(() => Math.max(20, value.split('\n').length + 2));
  useEffect(() => {
    setRows(Math.max(20, value.split('\n').length + 2));
  }, [value]);

  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={rows}
      spellCheck
      style={{
        display: 'block',
        width: '100%',
        minHeight: '60vh',
        fontFamily: t.font.mono,
        fontSize: t.size.body,
        lineHeight: 1.6,
        color: t.color.text,
        backgroundColor: t.color.surface,
        border: `1px solid ${t.color.border}`,
        borderRadius: t.radius.md,
        padding: `${t.space.md} ${t.space.lg}`,
        outline: 'none',
        resize: 'vertical',
      }}
    />
  );
}

function Preview({ markdown }: { markdown: string }) {
  // memoize so toggling Edit→Preview→Edit doesn't reparse identical markdown.
  const node = useMemo(
    () => <ReactMarkdown>{markdown}</ReactMarkdown>,
    [markdown],
  );
  return (
    <div
      className="memo-prose serif"
      style={{
        padding: `${t.space.lg} ${t.space.xl}`,
        backgroundColor: t.color.surface,
        border: `1px solid ${t.color.border}`,
        borderRadius: t.radius.md,
        minHeight: '60vh',
      }}
    >
      {node}
    </div>
  );
}
