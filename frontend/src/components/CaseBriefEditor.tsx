/**
 * CaseBriefEditor — composition of EditableLists, one per Case Brief
 * section, plus the editable citation row at the top.
 *
 * Saving is debounced: any local change updates parent state immediately
 * (so undo/redo within a session feels instant), and a 600ms debounce
 * fires PATCH /documents/{id} with the merged content. The parent is
 * responsible for actually calling the network.
 */
import { useEffect, useRef, useState } from 'react';
import EditableList from './EditableList';
import type { CaseBriefContent } from '../types';
import { t } from '../design/tokens';

interface Props {
  content: CaseBriefContent;
  onSave: (next: CaseBriefContent) => Promise<void>;
}

export default function CaseBriefEditor({ content, onSave }: Props) {
  const [local, setLocal] = useState<CaseBriefContent>(content);

  // When the prop changes (we just loaded the doc, or a different doc),
  // reset local. This is the standard "controlled-but-mostly-uncontrolled"
  // shape — the URL/route is the source of truth, local is the working copy.
  useEffect(() => {
    setLocal(content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<CaseBriefContent | null>(null);

  const update = (patch: Partial<CaseBriefContent>) => {
    setLocal(prev => {
      const next = { ...prev, ...patch };
      queue.current = next;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        if (queue.current) {
          onSave(queue.current).catch(err =>
            console.warn('Brief save failed:', err),
          );
        }
      }, 600);
      return next;
    });
  };

  // Make sure we don't lose pending edits if the component unmounts.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (queue.current) {
        onSave(queue.current).catch(() => {
          /* unmount race; nothing to do */
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <CitationRow
        value={local.citation ?? ''}
        onCommit={(v) => update({ citation: v.trim() || null })}
      />

      <EditableList
        title="Facts"
        items={local.facts}
        onChange={(items) => update({ facts: items })}
        addLabel="Add a fact"
      />

      <EditableList
        title="Issues"
        items={local.issues}
        onChange={(items) => update({ issues: items })}
        addLabel="Add an issue"
      />

      <EditableList
        title="Arguments — Petitioner"
        items={local.arguments_petitioner}
        onChange={(items) => update({ arguments_petitioner: items })}
        addLabel="Add a contention"
      />

      <EditableList
        title="Arguments — Respondent"
        items={local.arguments_respondent}
        onChange={(items) => update({ arguments_respondent: items })}
        addLabel="Add a contention"
      />

      <EditableList
        title="Ratio decidendi"
        items={local.ratio}
        onChange={(items) => update({ ratio: items })}
        addLabel="Add the binding rule"
        highlight
      />

      <EditableList
        title="Holding"
        items={local.holding}
        onChange={(items) => update({ holding: items })}
        addLabel="Add the disposal"
        highlight
      />

      <EditableList
        title="Obiter"
        items={local.dicta}
        onChange={(items) => update({ dicta: items })}
        addLabel="Add observation"
      />
    </div>
  );
}

function CitationRow({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);

  useEffect(() => setDraft(value), [value]);

  const finish = () => {
    setEditing(false);
    if (draft !== value) onCommit(draft);
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="mono cursor-pointer border-0 bg-transparent text-left"
        style={{
          display: 'block',
          marginBottom: t.space.lg,
          padding: `${t.space.sm} ${t.space.md}`,
          fontSize: t.size.ui,
          color: value ? t.color.accent : t.color.dim,
          backgroundColor: t.color.surface,
          border: `1px solid ${t.color.border}`,
          borderRadius: t.radius.sm,
          fontStyle: value ? 'normal' : 'italic',
        }}
      >
        {value || 'Click to add citation (e.g. AIR 2023 SC 1234)'}
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(value);
          setEditing(false);
        }
      }}
      onBlur={finish}
      className="mono"
      placeholder="AIR 2023 SC 1234"
      style={{
        display: 'block',
        width: '100%',
        marginBottom: t.space.lg,
        padding: `${t.space.sm} ${t.space.md}`,
        fontSize: t.size.ui,
        color: t.color.accent,
        backgroundColor: t.color.surface,
        border: `1px solid ${t.color.accent}`,
        borderRadius: t.radius.sm,
        outline: 'none',
        fontFamily: 'inherit',
      }}
    />
  );
}
