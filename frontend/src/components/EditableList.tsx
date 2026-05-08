/**
 * EditableList — a single titled section of bullet items the user can
 * add, edit, and delete inline. The shape of every Case Brief section
 * (Facts, Issues, Arguments, Ratio, Holding, Dicta) is exactly this:
 *   string[] → render → mutate → save.
 *
 * Editing model:
 *   click an item    → it becomes a textarea autosized to content
 *   ⌘/Ctrl + Enter   → commit
 *   Esc              → revert
 *   blur             → commit
 *   delete an item   → trash icon appears on hover
 *   add an item      → "+ Add" row at the bottom expands a fresh textarea
 *
 * The component is uncontrolled internally (it manages the draft text);
 * the parent owns the array and handles persistence on commit.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { t } from '../design/tokens';

interface Props {
  title: string;
  items: string[];
  onChange: (next: string[]) => void;
  /** Mark this list as the binding rule of the case (Ratio, Holding) — gets the saffron heading. */
  highlight?: boolean;
  /** Plain-language placeholder for an empty new item (e.g. "Add a fact…"). */
  addLabel?: string;
}

export default function EditableList({
  title,
  items,
  onChange,
  highlight,
  addLabel = 'Add an item',
}: Props) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [addingDraft, setAddingDraft] = useState('');

  const beginEdit = (i: number) => {
    setEditingIdx(i);
    setDraft(items[i]);
  };

  const commitEdit = () => {
    if (editingIdx === null) return;
    const next = items.slice();
    const trimmed = draft.trim();
    if (!trimmed) {
      next.splice(editingIdx, 1);  // empty content removes the item
    } else {
      next[editingIdx] = trimmed;
    }
    onChange(next);
    setEditingIdx(null);
    setDraft('');
  };

  const cancelEdit = () => {
    setEditingIdx(null);
    setDraft('');
  };

  const remove = (i: number) => {
    onChange(items.filter((_, idx) => idx !== i));
  };

  const commitAdd = () => {
    const trimmed = addingDraft.trim();
    if (trimmed) onChange([...items, trimmed]);
    setAdding(false);
    setAddingDraft('');
  };

  const cancelAdd = () => {
    setAdding(false);
    setAddingDraft('');
  };

  return (
    <section style={{ marginBottom: t.space.lg }}>
      <h3
        className="m-0"
        style={{
          fontSize: t.size.ui,
          fontWeight: t.weight.semibold,
          color: highlight ? t.color.accent : t.color.muted,
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          marginBottom: t.space.sm,
        }}
      >
        {title}
      </h3>

      {items.length === 0 && !adding && (
        <p
          className="m-0"
          style={{
            fontSize: t.size.ui,
            color: t.color.dim,
            fontStyle: 'italic',
            marginBottom: t.space.sm,
          }}
        >
          (none)
        </p>
      )}

      <ul className="m-0 p-0 list-none" style={{ marginBottom: t.space.sm }}>
        {items.map((item, i) =>
          editingIdx === i ? (
            <ItemTextarea
              key={i}
              value={draft}
              onChange={setDraft}
              onCommit={commitEdit}
              onCancel={cancelEdit}
              autoFocus
            />
          ) : (
            <ItemRow
              key={i}
              text={item}
              onClick={() => beginEdit(i)}
              onDelete={() => remove(i)}
            />
          ),
        )}
      </ul>

      {adding ? (
        <ItemTextarea
          value={addingDraft}
          onChange={setAddingDraft}
          onCommit={commitAdd}
          onCancel={cancelAdd}
          placeholder={addLabel}
          autoFocus
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center cursor-pointer border-0 bg-transparent"
          style={{
            gap: t.space.xs,
            padding: `${t.space.xs} 0`,
            fontSize: t.size.ui,
            color: t.color.muted,
            fontWeight: t.weight.medium,
            transition: t.motion.fast,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = t.color.accent)}
          onMouseLeave={e => (e.currentTarget.style.color = t.color.muted)}
        >
          <Plus size={12} />
          {items.length === 0 ? addLabel : 'Add'}
        </button>
      )}
    </section>
  );
}

function ItemRow({
  text,
  onClick,
  onDelete,
}: {
  text: string;
  onClick: () => void;
  onDelete: () => void;
}) {
  return (
    <li
      className="group flex items-start"
      style={{
        gap: t.space.sm,
        padding: `${t.space.xs} 0`,
        cursor: 'text',
      }}
      onClick={onClick}
    >
      <span
        aria-hidden
        style={{
          color: t.color.dim,
          marginTop: '0.55em',
          flexShrink: 0,
          width: '4px',
          height: '4px',
          borderRadius: '50%',
          backgroundColor: t.color.dim,
        }}
      />
      <span
        className="flex-1"
        style={{
          fontSize: t.size.body,
          lineHeight: 1.6,
          color: t.color.text,
        }}
      >
        {text}
      </span>
      <button
        onClick={e => {
          e.stopPropagation();
          onDelete();
        }}
        className="opacity-0 group-hover:opacity-100 cursor-pointer border-0 bg-transparent flex-shrink-0"
        style={{
          padding: t.space.xs,
          color: t.color.dim,
          transition: t.motion.fast,
          marginTop: '2px',
        }}
        title="Remove"
      >
        <Trash2 size={12} />
      </button>
    </li>
  );
}

function ItemTextarea({
  value,
  onChange,
  onCommit,
  onCancel,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow to fit content
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  // Place caret at end on first focus
  useEffect(() => {
    if (autoFocus && ref.current) {
      const len = ref.current.value.length;
      ref.current.setSelectionRange(len, len);
    }
  }, [autoFocus]);

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onCommit();
    }
  };

  return (
    <textarea
      ref={ref}
      autoFocus={autoFocus}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={onKey}
      onBlur={onCommit}
      placeholder={placeholder}
      rows={1}
      style={{
        display: 'block',
        width: '100%',
        resize: 'none',
        fontFamily: 'inherit',
        fontSize: t.size.body,
        lineHeight: 1.6,
        color: t.color.text,
        backgroundColor: t.color.surface,
        border: `1px solid ${t.color.border}`,
        borderRadius: t.radius.sm,
        padding: `${t.space.xs} ${t.space.sm}`,
        outline: 'none',
        transition: t.motion.fast,
        marginBottom: t.space.xs,
      }}
      onFocus={e => (e.currentTarget.style.borderColor = t.color.accent)}
    />
  );
}
