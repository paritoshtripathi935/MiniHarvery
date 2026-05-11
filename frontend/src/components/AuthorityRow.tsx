/**
 * AuthorityRow — one pinned case. Top line: case name + citation +
 * meta. Body: proposition (single-row textarea), paragraphs cited
 * (chip-style input), notes (toggleable textarea). All fields
 * autosave via useDebouncedSave; the MoreMenu offers Open source +
 * Unpin.
 *
 * Optimistic updates are driven by the parent (`AuthoritiesPanel`);
 * this component is presentational over local-edit state.
 */
import { useState } from 'react';
import { ExternalLink, StickyNote, X } from 'lucide-react';
import { useDebouncedSave } from '../hooks/useDebouncedSave';
import MoreMenu from './MoreMenu';
import { t } from '../design/tokens';
import type { Authority } from '../types';
import type { UpdateAuthorityInput } from '../services/api';

interface Props {
  authority: Authority;
  onUpdate: (id: string, fields: UpdateAuthorityInput) => Promise<void>;
  onUnpin: (id: string) => Promise<void>;
}

export default function AuthorityRow({ authority, onUpdate, onUnpin }: Props) {
  const [proposition, setProposition] = useState(authority.proposition ?? '');
  const [paragraphs, setParagraphs] = useState(
    (authority.paragraphs ?? []).join(', '),
  );
  const [notes, setNotes] = useState(authority.notes ?? '');
  const [notesOpen, setNotesOpen] = useState(Boolean(authority.notes));

  const save = useDebouncedSave<UpdateAuthorityInput>(async fields => {
    await onUpdate(authority.id, fields);
  });

  const handleProposition = (value: string) => {
    setProposition(value);
    save({ proposition: value });
  };

  const handleParagraphs = (value: string) => {
    setParagraphs(value);
    save({
      paragraphs: value
        .split(',')
        .map(p => p.trim())
        .filter(Boolean),
    });
  };

  const handleNotes = (value: string) => {
    setNotes(value);
    save({ notes: value });
  };

  const handleUnpin = async () => {
    if (!window.confirm(`Unpin "${authority.case_name}" from this matter?`)) return;
    await onUnpin(authority.id);
  };

  const meta = [authority.court, authority.year ? String(authority.year) : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <article
      style={{
        padding: `${t.space.md} 0`,
        borderBottom: `1px solid ${t.color.border}`,
      }}
    >
      {/* Top row — case name + citation + actions */}
      <header
        className="flex items-start justify-between"
        style={{ gap: t.space.md, marginBottom: t.space.sm }}
      >
        <div className="min-w-0 flex-1">
          <h3
            className="serif m-0"
            style={{
              fontSize: '17px',
              fontWeight: t.weight.semibold,
              color: t.color.text,
              lineHeight: 1.3,
              letterSpacing: '-0.005em',
            }}
          >
            {authority.case_name}
          </h3>
          <div
            className="flex items-baseline"
            style={{
              gap: t.space.sm,
              marginTop: '2px',
              flexWrap: 'wrap',
            }}
          >
            {authority.citation && (
              <span
                className="mono"
                style={{
                  fontSize: t.size.ui,
                  color: t.color.accentBright,
                  fontFamily: t.font.mono,
                }}
              >
                {authority.citation}
              </span>
            )}
            {meta && (
              <span
                style={{ fontSize: t.size.micro, color: t.color.muted }}
              >
                {authority.citation ? `· ${meta}` : meta}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center" style={{ gap: t.space.xs, flexShrink: 0 }}>
          {authority.source_url && (
            <a
              href={authority.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center cursor-pointer"
              style={{
                gap: t.space.xs,
                padding: `${t.space.xs} ${t.space.sm}`,
                fontSize: t.size.micro,
                color: t.color.muted,
                borderRadius: t.radius.sm,
                textDecoration: 'none',
              }}
              title="Open source"
            >
              <ExternalLink size={11} />
              Source
            </a>
          )}
          <MoreMenu
            items={[
              {
                label: notesOpen ? 'Hide notes' : 'Add notes',
                onClick: () => setNotesOpen(open => !open),
              },
              {
                label: 'Unpin',
                onClick: handleUnpin,
                danger: true,
              },
            ]}
          />
        </div>
      </header>

      {/* Proposition */}
      <div style={{ marginBottom: t.space.sm }}>
        <MicroLabel>Proposition</MicroLabel>
        <textarea
          value={proposition}
          onChange={e => handleProposition(e.target.value)}
          placeholder="What rule does this case stand for?"
          rows={2}
          style={{
            display: 'block',
            width: '100%',
            fontFamily: t.font.serif,
            fontSize: t.size.body,
            color: t.color.text,
            backgroundColor: 'transparent',
            border: `1px solid transparent`,
            borderRadius: t.radius.sm,
            padding: `${t.space.xs} ${t.space.sm}`,
            outline: 'none',
            resize: 'vertical',
            lineHeight: 1.5,
            transition: 'border-color 120ms',
          }}
          onFocus={e => {
            e.currentTarget.style.borderColor = t.color.border;
            e.currentTarget.style.backgroundColor = t.color.surface;
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = 'transparent';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        />
      </div>

      {/* Paragraphs cited */}
      <div className="flex items-baseline" style={{ gap: t.space.sm, marginBottom: t.space.sm }}>
        <MicroLabel>Paragraphs</MicroLabel>
        <input
          type="text"
          value={paragraphs}
          onChange={e => handleParagraphs(e.target.value)}
          placeholder="¶12, ¶14-16"
          style={{
            flex: 1,
            fontFamily: t.font.mono,
            fontSize: t.size.ui,
            color: t.color.text,
            backgroundColor: 'transparent',
            border: `1px solid transparent`,
            borderRadius: t.radius.sm,
            padding: `${t.space.xs} ${t.space.sm}`,
            outline: 'none',
            transition: 'border-color 120ms',
          }}
          onFocus={e => {
            e.currentTarget.style.borderColor = t.color.border;
            e.currentTarget.style.backgroundColor = t.color.surface;
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = 'transparent';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        />
      </div>

      {/* Notes (toggleable) */}
      {notesOpen && (
        <div style={{ marginBottom: t.space.sm }}>
          <div className="flex items-center" style={{ gap: t.space.xs, marginBottom: t.space.xs }}>
            <StickyNote size={11} style={{ color: t.color.muted }} />
            <MicroLabel inline>Notes</MicroLabel>
            <button
              onClick={() => {
                setNotesOpen(false);
                handleNotes('');
              }}
              className="cursor-pointer border-0 bg-transparent"
              style={{
                marginLeft: 'auto',
                color: t.color.dim,
                padding: 0,
              }}
              aria-label="Hide notes"
              title="Clear and hide"
            >
              <X size={11} />
            </button>
          </div>
          <textarea
            value={notes}
            onChange={e => handleNotes(e.target.value)}
            placeholder="Distinguishing facts, follow-ups, anything you want to remember."
            rows={2}
            style={{
              display: 'block',
              width: '100%',
              fontFamily: t.font.sans,
              fontSize: t.size.ui,
              color: t.color.muted,
              backgroundColor: t.color.surface,
              border: `1px solid ${t.color.border}`,
              borderRadius: t.radius.sm,
              padding: `${t.space.xs} ${t.space.sm}`,
              outline: 'none',
              resize: 'vertical',
              lineHeight: 1.5,
            }}
          />
        </div>
      )}
    </article>
  );
}

function MicroLabel({ children, inline }: { children: React.ReactNode; inline?: boolean }) {
  return (
    <label
      style={{
        display: inline ? 'inline' : 'block',
        fontSize: t.size.micro,
        fontWeight: t.weight.semibold,
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        color: t.color.dim,
        marginBottom: inline ? 0 : t.space.xs,
        flexShrink: 0,
        minWidth: inline ? undefined : '90px',
      }}
    >
      {children}
    </label>
  );
}
