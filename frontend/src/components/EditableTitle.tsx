import { useEffect, useState } from 'react';
import { t } from '../design/tokens';

interface Props {
  title: string;
  onCommit: (next: string) => void;
  /** Inline font size (default `'20px'`). */
  fontSize?: string;
  /** Cap on visible width before ellipsis (default `'60ch'`). */
  maxWidth?: string;
}

/**
 * Click-to-edit heading. Commits on Enter or blur, cancels on Esc, ignores
 * empty/unchanged values. Renders a serif <h1> in the read state and an
 * input with the same metrics in edit state.
 */
export default function EditableTitle({
  title,
  onCommit,
  fontSize = '20px',
  maxWidth = '60ch',
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  useEffect(() => setDraft(title), [title]);

  const finish = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== title) onCommit(draft.trim());
    else setDraft(title);
  };

  if (!editing) {
    return (
      <h1
        onClick={() => setEditing(true)}
        className="serif truncate m-0"
        style={{
          fontSize,
          fontWeight: t.weight.semibold,
          color: t.color.text,
          letterSpacing: '-0.005em',
          cursor: 'text',
          minWidth: 0,
          flexShrink: 1,
          maxWidth,
        }}
        title={title}
      >
        {title}
      </h1>
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
          setDraft(title);
          setEditing(false);
        }
      }}
      onBlur={finish}
      className="serif"
      style={{
        flex: 1,
        minWidth: 0,
        padding: `${t.space.xs} ${t.space.sm}`,
        fontSize,
        fontWeight: t.weight.semibold,
        color: t.color.text,
        backgroundColor: t.color.surface,
        border: `1px solid ${t.color.accent}`,
        borderRadius: t.radius.sm,
        outline: 'none',
        fontFamily: t.font.serif,
      }}
    />
  );
}
