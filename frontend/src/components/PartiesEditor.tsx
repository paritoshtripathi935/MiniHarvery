import { Plus, X } from 'lucide-react';
import type { Party } from '../types';
import { t } from '../design/tokens';

interface Props {
  parties: Party[];
  onChange: (next: Party[]) => void;
  disabled?: boolean;
}

/**
 * Editable list of `{role, name}` rows. Free-text role and name — Indian
 * legal practice uses many role labels (petitioner, respondent, plaintiff,
 * defendant, appellant, complainant, accused, intervener, …); a fixed
 * dropdown would be wrong.
 *
 * Empty rows are kept in the list while the user is typing — pruning
 * happens on parent commit so the user doesn't get a row deleted from
 * under them mid-keystroke.
 */
export default function PartiesEditor({ parties, onChange, disabled }: Props) {
  const updateRow = (idx: number, patch: Partial<Party>) => {
    const next = parties.slice();
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const removeRow = (idx: number) => {
    onChange(parties.filter((_, i) => i !== idx));
  };

  const addRow = () => {
    onChange([...parties, { role: '', name: '' }]);
  };

  return (
    <div>
      <label
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
        Parties
      </label>

      {parties.length === 0 && (
        <p
          className="m-0"
          style={{
            fontSize: t.size.ui,
            color: t.color.dim,
            fontStyle: 'italic',
            marginBottom: t.space.sm,
          }}
        >
          No parties yet — add petitioner / respondent rows below.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: t.space.xs }}>
        {parties.map((p, i) => (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '160px 1fr 28px',
              gap: t.space.sm,
              alignItems: 'center',
            }}
          >
            <input
              value={p.role}
              onChange={e => updateRow(i, { role: e.target.value })}
              placeholder="Role (e.g. Petitioner)"
              disabled={disabled}
              style={inputStyle}
            />
            <input
              value={p.name}
              onChange={e => updateRow(i, { name: e.target.value })}
              placeholder="Name"
              disabled={disabled}
              style={inputStyle}
            />
            <button
              onClick={() => removeRow(i)}
              disabled={disabled}
              className="cursor-pointer border-0 bg-transparent flex items-center justify-center"
              style={{
                width: '28px',
                height: '28px',
                borderRadius: t.radius.sm,
                color: t.color.dim,
                transition: t.motion.fast,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = t.color.danger;
                e.currentTarget.style.backgroundColor = t.color.hover;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = t.color.dim;
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
              title="Remove party"
              aria-label={`Remove ${p.role || 'party'} ${p.name || ''}`.trim()}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addRow}
        disabled={disabled}
        className="cursor-pointer border-0 bg-transparent inline-flex items-center"
        style={{
          gap: t.space.xs,
          padding: `${t.space.xs} ${t.space.sm}`,
          marginTop: t.space.sm,
          fontSize: t.size.ui,
          fontWeight: t.weight.medium,
          color: t.color.accent,
          borderRadius: t.radius.sm,
          transition: t.motion.fast,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.backgroundColor = t.color.hover;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <Plus size={13} />
        Add party
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  fontFamily: 'inherit',
  fontSize: t.size.body,
  color: t.color.text,
  backgroundColor: t.color.surface,
  border: `1px solid ${t.color.border}`,
  borderRadius: t.radius.sm,
  padding: `${t.space.sm} ${t.space.md}`,
  outline: 'none',
};
