/**
 * NewDraftDialog — two-step dialog that creates a pleading draft.
 *
 *   1. Pick template (2×2 grid of cards).
 *   2. Fill the template's fields → submit.
 *
 * The field set is wildly different per template (a plaint and a legal
 * notice barely overlap), so a single-screen "dropdown silently swaps
 * the form" UX would be jarring. Two steps with a back button keeps it
 * clear which artefact the user is producing.
 *
 * On success the parent is notified via `onCreated` and is responsible
 * for navigating to the new document page.
 */
import { useEffect, useState } from 'react';
import { ArrowLeft, FileText, Gavel, Scale, Send, Loader2 } from 'lucide-react';
import { useAuth, useUser } from '@clerk/clerk-react';
import type { DraftField as DraftFieldDef, DraftTemplate, PleadingDraftDocument } from '../types';
import { generatePleadingDraft, type GeneratePleadingDraftInput } from '../services/api';
import { loadDraftTemplates } from '../services/draftTemplates';
import Dialog from './Dialog';
import DraftField from './DraftField';
import { t } from '../design/tokens';

interface Props {
  open: boolean;
  matterId: string;
  onClose: () => void;
  onCreated: (doc: PleadingDraftDocument) => void;
}

type Step = 'pick' | 'fill';

const TEMPLATE_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  plaint: Scale,
  writ_226: Gavel,
  anticipatory_bail: FileText,
  legal_notice: Send,
};

export default function NewDraftDialog({ open, matterId, onClose, onCreated }: Props) {
  const { user } = useUser();
  const { getToken } = useAuth();

  const [templates, setTemplates] = useState<DraftTemplate[] | null>(null);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('pick');
  const [selected, setSelected] = useState<DraftTemplate | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load templates on open. Cached at the module level — repeated opens
  // don't re-fetch.
  useEffect(() => {
    if (!open) return;
    setStep('pick');
    setSelected(null);
    setValues({});
    setBusy(false);
    setSubmitError(null);
    setTemplatesError(null);

    loadDraftTemplates(user?.id, () => getToken())
      .then(setTemplates)
      .catch(err => {
        setTemplatesError(
          err instanceof Error ? err.message : 'Could not load templates',
        );
      });
  }, [open, user?.id, getToken]);

  const choose = (tpl: DraftTemplate) => {
    setSelected(tpl);
    // Seed empty values so React doesn't complain about uncontrolled inputs.
    const seed: Record<string, unknown> = {};
    for (const f of tpl.fields) {
      seed[f.id] = f.type === 'list' ? [] : '';
    }
    setValues(seed);
    setStep('fill');
    setSubmitError(null);
  };

  const back = () => {
    if (busy) return;
    setStep('pick');
    setSelected(null);
    setSubmitError(null);
  };

  const updateField = (id: string, next: unknown) => {
    setValues(prev => ({ ...prev, [id]: next }));
  };

  const submit = async () => {
    if (!selected || busy) return;
    const missing = selected.fields
      .filter(f => f.required && isEmpty(values[f.id], f.type))
      .map(f => f.label);
    if (missing.length) {
      setSubmitError(`Required: ${missing.join(', ')}.`);
      return;
    }

    setBusy(true);
    setSubmitError(null);
    try {
      const input: GeneratePleadingDraftInput = {
        template_id: selected.id,
        fields: values,
      };
      const doc = await generatePleadingDraft(matterId, input, user?.id, () => getToken());
      onCreated(doc);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Draft generation failed.',
      );
      setBusy(false);
    }
  };

  // Header content depends on step.
  const isPick = step === 'pick';
  const title = isPick ? 'New draft' : (selected?.label ?? 'New draft');
  const subtitle = isPick
    ? 'Choose a template. Vidhi turns your inputs into a first draft you can refine.'
    : (selected?.description ?? '');

  return (
    <Dialog
      open={open}
      busy={busy}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        isPick ? (
          <button
            onClick={onClose}
            className="cursor-pointer border-0 bg-transparent"
            style={cancelStyle}
          >
            Cancel
          </button>
        ) : (
          <>
            <button
              onClick={back}
              disabled={busy}
              className="cursor-pointer border-0 bg-transparent inline-flex items-center disabled:cursor-not-allowed"
              style={{ ...cancelStyle, gap: t.space.xs }}
            >
              <ArrowLeft size={13} /> Back
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
              {busy ? 'Generating…' : 'Generate draft'}
            </button>
          </>
        )
      }
    >
      {isPick ? (
        templatesError ? (
          <p style={{ color: t.color.danger, fontSize: t.size.body }}>
            Could not load templates: {templatesError}
          </p>
        ) : templates ? (
          <TemplateGrid templates={templates} onChoose={choose} />
        ) : (
          <p style={{ color: t.color.muted, fontSize: t.size.body }}>Loading templates…</p>
        )
      ) : selected ? (
        <FieldsForm
          fields={selected.fields}
          values={values}
          onChange={updateField}
          disabled={busy}
          submitError={submitError}
        />
      ) : null}
    </Dialog>
  );
}

function isEmpty(value: unknown, type: DraftFieldDef['type']): boolean {
  if (type === 'list') return !Array.isArray(value) || value.length === 0;
  return typeof value !== 'string' || value.trim().length === 0;
}

function TemplateGrid({
  templates,
  onChoose,
}: {
  templates: DraftTemplate[];
  onChoose: (tpl: DraftTemplate) => void;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: t.space.sm,
      }}
    >
      {templates.map(tpl => {
        const Icon = TEMPLATE_ICON[tpl.id] ?? FileText;
        return (
          <button
            key={tpl.id}
            onClick={() => onChoose(tpl)}
            className="cursor-pointer text-left border-0 bg-transparent"
            style={{
              padding: t.space.md,
              backgroundColor: t.color.surface,
              border: `1px solid ${t.color.border}`,
              borderRadius: t.radius.md,
              transition: t.motion.fast,
              display: 'flex',
              flexDirection: 'column',
              gap: t.space.xs,
              minHeight: '110px',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = t.color.accent;
              e.currentTarget.style.backgroundColor = t.color.hover;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = t.color.border;
              e.currentTarget.style.backgroundColor = t.color.surface;
            }}
          >
            <span
              className="inline-flex items-center"
              style={{ gap: t.space.xs, color: t.color.accent }}
            >
              <Icon size={14} />
              <span
                className="serif"
                style={{
                  fontSize: t.size.body,
                  fontWeight: t.weight.semibold,
                  color: t.color.text,
                }}
              >
                {tpl.label}
              </span>
            </span>
            <p
              className="m-0"
              style={{ fontSize: t.size.ui, color: t.color.muted, lineHeight: 1.45 }}
            >
              {tpl.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function FieldsForm({
  fields,
  values,
  onChange,
  disabled,
  submitError,
}: {
  fields: DraftFieldDef[];
  values: Record<string, unknown>;
  onChange: (id: string, next: unknown) => void;
  disabled: boolean;
  submitError: string | null;
}) {
  return (
    <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: t.space.xs }}>
      {fields.map(f => (
        <DraftField
          key={f.id}
          field={f}
          value={values[f.id]}
          onChange={next => onChange(f.id, next)}
          disabled={disabled}
        />
      ))}
      {submitError && (
        <p
          className="m-0"
          style={{
            marginTop: t.space.sm,
            fontSize: t.size.ui,
            color: t.color.danger,
          }}
        >
          {submitError}
        </p>
      )}
    </div>
  );
}

const cancelStyle: React.CSSProperties = {
  padding: `${t.space.sm} ${t.space.md}`,
  fontSize: t.size.ui,
  fontWeight: t.weight.medium,
  color: t.color.muted,
  borderRadius: t.radius.sm,
};
