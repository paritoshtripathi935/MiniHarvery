/**
 * MatterSettingsForm — edits matter metadata (title, description, parties,
 * court, cause number, status). Auto-saves on change with a 600ms debounce,
 * matching the rest of the editing surface (CaseBriefEditor, document title).
 *
 * The form is the source of truth while the user is editing; it reconciles
 * against the prop only when the upstream `matter.id` changes (i.e. the
 * user navigated to a different matter) so a debounced PATCH that lands
 * mid-edit doesn't overwrite the in-flight changes.
 *
 * Inbox handling: the special `is_inbox` matter is allowed to be edited
 * (description / parties / court can carry useful context) but its title
 * and status are locked because the backend treats Inbox as a sentinel.
 */
import { useEffect, useState } from 'react';
import { Loader2, Inbox } from 'lucide-react';
import type { MatterDetail, Party } from '../types';
import type { UpdateMatterInput } from '../services/api';
import { useMatters } from '../state/MattersContext';
import { useDebouncedSave } from '../hooks/useDebouncedSave';
import { Field, TextArea, TextInput } from './Field';
import PartiesEditor from './PartiesEditor';
import { t } from '../design/tokens';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type Status = MatterDetail['status'];

interface FormState {
  title: string;
  description: string;
  parties: Party[];
  court: string;
  cause_number: string;
  status: Status;
}

function fromDetail(m: MatterDetail): FormState {
  return {
    title: m.title,
    description: m.description ?? '',
    parties: m.parties,
    court: m.court ?? '',
    cause_number: m.cause_number ?? '',
    status: m.status,
  };
}

function toUpdateInput(prev: FormState, next: FormState): UpdateMatterInput {
  // Only send keys that actually changed. Empty strings map to null on the
  // server for the optional text fields; title falls back to its previous
  // value if cleared (server will refuse empty anyway).
  const out: UpdateMatterInput = {};
  if (next.title.trim() && next.title !== prev.title) out.title = next.title.trim();
  if (next.description !== prev.description) {
    out.description = next.description.trim() || undefined;
  }
  if (next.court !== prev.court) out.court = next.court.trim() || undefined;
  if (next.cause_number !== prev.cause_number) {
    out.cause_number = next.cause_number.trim() || undefined;
  }
  if (next.status !== prev.status) out.status = next.status;
  if (!partiesEqual(prev.parties, next.parties)) {
    out.parties = next.parties.filter(p => p.role.trim() || p.name.trim());
  }
  return out;
}

function partiesEqual(a: Party[], b: Party[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((p, i) => p.role === b[i].role && p.name === b[i].name);
}

interface Props {
  matter: MatterDetail;
  /** Called with the freshest detail after each successful save. The page
   *  uses this to keep `activeMatter` in sync so a tab switch + return
   *  doesn't reset the form to stale values. */
  onUpdated?: (next: MatterDetail) => void;
}

export default function MatterSettingsForm({ matter, onUpdated }: Props) {
  const { updateMatter } = useMatters();
  const [form, setForm] = useState<FormState>(() => fromDetail(matter));
  const [committed, setCommitted] = useState<FormState>(() => fromDetail(matter));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  // Reset state only when the user navigates to a different matter. While
  // editing the same matter, ignore prop updates (they may be the result
  // of our own optimistic dispatch landing late).
  useEffect(() => {
    const fresh = fromDetail(matter);
    setForm(fresh);
    setCommitted(fresh);
    setSaveStatus('idle');
  }, [matter.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const queueSave = useDebouncedSave(async (next: FormState) => {
    const patch = toUpdateInput(committed, next);
    if (Object.keys(patch).length === 0) return;
    setSaveStatus('saving');
    try {
      const detail = await updateMatter(matter.id, patch);
      setCommitted(fromDetail(detail));
      onUpdated?.(detail);
      setSaveStatus('saved');
      window.setTimeout(() => {
        setSaveStatus(s => (s === 'saved' ? 'idle' : s));
      }, 1800);
    } catch (e: unknown) {
      console.warn('Matter save failed:', e);
      setSaveStatus('error');
    }
  }, 600);

  const update = (patch: Partial<FormState>) => {
    setForm(prev => {
      const next = { ...prev, ...patch };
      queueSave(next);
      return next;
    });
  };

  const isInbox = matter.is_inbox;

  return (
    <main
      className="flex-1 overflow-y-auto"
      style={{
        backgroundColor: t.color.bg,
        padding: `${t.space.lg} ${t.space.xl}`,
      }}
    >
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        <Header isInbox={isInbox} saveStatus={saveStatus} />

        {isInbox && <InboxNotice />}

        <Field label="Title" htmlFor="matter-title">
          <TextInput
            id="matter-title"
            value={form.title}
            onChange={e => update({ title: e.target.value })}
            disabled={isInbox}
            placeholder="e.g. Sharma v Sharma — divorce petition"
          />
        </Field>

        <Field
          label="Description"
          htmlFor="matter-description"
          hint="Internal note — what this matter is about, what stage it's at."
        >
          <TextArea
            id="matter-description"
            value={form.description}
            onChange={e => update({ description: e.target.value })}
            placeholder="Background, issues, key facts. Markdown not rendered yet — keep it as plain notes."
            rows={4}
            style={{ minHeight: '110px' }}
          />
        </Field>

        <div style={{ marginBottom: t.space.md }}>
          <PartiesEditor
            parties={form.parties}
            onChange={parties => update({ parties })}
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: t.space.md,
          }}
        >
          <Field label="Court" htmlFor="matter-court">
            <TextInput
              id="matter-court"
              value={form.court}
              onChange={e => update({ court: e.target.value })}
              placeholder="e.g. Delhi High Court"
            />
          </Field>
          <Field label="Cause number" htmlFor="matter-cause-number">
            <TextInput
              id="matter-cause-number"
              value={form.cause_number}
              onChange={e => update({ cause_number: e.target.value })}
              placeholder="e.g. CS(OS) 1234/2024"
            />
          </Field>
        </div>

        {!isInbox && (
          <Field label="Status" htmlFor="matter-status">
            <StatusToggle
              value={form.status}
              onChange={status => update({ status })}
            />
          </Field>
        )}
      </div>
    </main>
  );
}

function Header({
  isInbox,
  saveStatus,
}: {
  isInbox: boolean;
  saveStatus: SaveStatus;
}) {
  return (
    <header
      className="flex items-center"
      style={{ gap: t.space.sm, marginBottom: t.space.lg }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2
          className="serif m-0"
          style={{
            fontSize: t.size.h2,
            fontWeight: t.weight.semibold,
            color: t.color.text,
            letterSpacing: '-0.005em',
          }}
        >
          {isInbox ? 'Inbox settings' : 'Matter settings'}
        </h2>
        <p
          className="m-0"
          style={{
            fontSize: t.size.ui,
            color: t.color.muted,
            marginTop: '2px',
          }}
        >
          Changes save automatically.
        </p>
      </div>
      <SaveIndicator status={saveStatus} />
    </header>
  );
}

function InboxNotice() {
  return (
    <div
      className="flex items-start"
      style={{
        gap: t.space.sm,
        padding: `${t.space.sm} ${t.space.md}`,
        marginBottom: t.space.lg,
        fontSize: t.size.ui,
        color: t.color.muted,
        backgroundColor: t.color.surface,
        border: `1px solid ${t.color.border}`,
        borderRadius: t.radius.md,
      }}
    >
      <Inbox size={14} style={{ color: t.color.dim, marginTop: '2px', flexShrink: 0 }} />
      <p className="m-0" style={{ lineHeight: 1.55 }}>
        Inbox is the default landing matter for unscoped research. Title and
        status are locked, but description / parties / court are useful for
        keeping context across stray queries.
      </p>
    </div>
  );
}

const STATUS_OPTIONS: Array<{ value: Status; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
  { value: 'archived', label: 'Archived' },
];

function StatusToggle({
  value,
  onChange,
}: {
  value: Status;
  onChange: (v: Status) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Matter status"
      style={{
        display: 'inline-flex',
        gap: '2px',
        padding: '2px',
        backgroundColor: t.color.surface,
        border: `1px solid ${t.color.border}`,
        borderRadius: t.radius.md,
      }}
    >
      {STATUS_OPTIONS.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className="cursor-pointer border-0"
            style={{
              padding: `${t.space.xs} ${t.space.md}`,
              fontSize: t.size.ui,
              fontWeight: t.weight.medium,
              color: active ? t.color.text : t.color.muted,
              backgroundColor: active ? t.color.hover : 'transparent',
              borderRadius: t.radius.sm,
              transition: t.motion.fast,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
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

