/**
 * AddAuthorityDialog — manual entry for cases the advocate is bringing
 * in from outside Vidhi (a book, an unprovided judgment, a draft they
 * already have). Most pins come from the citation chip on the chat
 * answer or from the brief auto-pin; this dialog covers the residual.
 */
import { useState, type FormEvent } from 'react';
import { Field, TextArea, TextInput } from './Field';
import Dialog from './Dialog';
import { t } from '../design/tokens';
import type { PinAuthorityInput } from '../services/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: PinAuthorityInput) => Promise<void>;
}

export default function AddAuthorityDialog({ open, onClose, onSubmit }: Props) {
  const [caseName, setCaseName] = useState('');
  const [citation, setCitation] = useState('');
  const [court, setCourt] = useState('');
  const [year, setYear] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [proposition, setProposition] = useState('');
  const [paragraphs, setParagraphs] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setCaseName('');
    setCitation('');
    setCourt('');
    setYear('');
    setSourceUrl('');
    setProposition('');
    setParagraphs('');
    setNotes('');
    setError(null);
  };

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!caseName.trim()) {
      setError('Case name is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const parsedYear = year.trim() ? Number(year.trim()) : undefined;
      const parsedParas = paragraphs
        .split(',')
        .map(p => p.trim())
        .filter(Boolean);
      await onSubmit({
        case_name: caseName.trim(),
        citation: citation.trim() || undefined,
        court: court.trim() || undefined,
        year: Number.isFinite(parsedYear) ? parsedYear : undefined,
        source_url: sourceUrl.trim() || undefined,
        proposition: proposition.trim() || undefined,
        paragraphs: parsedParas.length ? parsedParas : undefined,
        notes: notes.trim() || undefined,
      });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pin authority');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      busy={busy}
      title="Add authority"
      subtitle="Pin a case to this matter's Table of Authorities."
      onClose={handleClose}
      footer={
        <>
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            style={secondaryButton}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-authority-form"
            disabled={busy || !caseName.trim()}
            className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            style={primaryButton}
          >
            {busy ? 'Pinning…' : 'Pin authority'}
          </button>
        </>
      }
    >
      <form id="add-authority-form" onSubmit={handleSubmit}>
        <Field label="Case name" htmlFor="authority-case-name">
          <TextInput
            id="authority-case-name"
            value={caseName}
            onChange={e => setCaseName(e.target.value)}
            placeholder="Vishaka v. State of Rajasthan"
            autoFocus
            required
          />
        </Field>

        <div className="flex" style={{ gap: t.space.md }}>
          <div style={{ flex: 2 }}>
            <Field label="Citation" htmlFor="authority-citation">
              <TextInput
                id="authority-citation"
                value={citation}
                onChange={e => setCitation(e.target.value)}
                placeholder="(1997) 6 SCC 241"
              />
            </Field>
          </div>
          <div style={{ flex: 1 }}>
            <Field label="Year" htmlFor="authority-year">
              <TextInput
                id="authority-year"
                value={year}
                onChange={e => setYear(e.target.value)}
                placeholder="1997"
                inputMode="numeric"
              />
            </Field>
          </div>
        </div>

        <Field label="Court" htmlFor="authority-court">
          <TextInput
            id="authority-court"
            value={court}
            onChange={e => setCourt(e.target.value)}
            placeholder="Supreme Court of India"
          />
        </Field>

        <Field label="Source URL" htmlFor="authority-source-url" hint="Indian Kanoon, India Code, or judgment PDF. Optional.">
          <TextInput
            id="authority-source-url"
            type="url"
            value={sourceUrl}
            onChange={e => setSourceUrl(e.target.value)}
            placeholder="https://indiankanoon.org/doc/…"
          />
        </Field>

        <Field
          label="Proposition"
          htmlFor="authority-proposition"
          hint="The rule the case stands for, in your words."
        >
          <TextArea
            id="authority-proposition"
            value={proposition}
            onChange={e => setProposition(e.target.value)}
            style={{ minHeight: '80px' }}
            placeholder="What does this case stand for?"
          />
        </Field>

        <Field
          label="Paragraphs cited"
          htmlFor="authority-paragraphs"
          hint="Comma-separated. e.g. ¶12, ¶14-16"
        >
          <TextInput
            id="authority-paragraphs"
            value={paragraphs}
            onChange={e => setParagraphs(e.target.value)}
            placeholder="¶12, ¶14-16"
          />
        </Field>

        <Field label="Notes" htmlFor="authority-notes">
          <TextArea
            id="authority-notes"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{ minHeight: '80px' }}
            placeholder="Optional — context, distinguishing facts, follow-ups."
          />
        </Field>

        {error && (
          <p
            className="m-0"
            style={{
              fontSize: t.size.ui,
              color: t.color.danger,
              marginTop: t.space.sm,
            }}
          >
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}

const primaryButton: React.CSSProperties = {
  padding: `${t.space.sm} ${t.space.md}`,
  fontSize: t.size.ui,
  fontWeight: t.weight.semibold,
  color: t.color.bg,
  backgroundColor: t.color.accent,
  border: 'none',
  borderRadius: t.radius.md,
  transition: t.motion.fast,
};

const secondaryButton: React.CSSProperties = {
  padding: `${t.space.sm} ${t.space.md}`,
  fontSize: t.size.ui,
  fontWeight: t.weight.medium,
  color: t.color.muted,
  backgroundColor: 'transparent',
  border: `1px solid ${t.color.border}`,
  borderRadius: t.radius.md,
  transition: t.motion.fast,
};
