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
 * Two open modes:
 *   - **Inside a matter** — `matterId` provided; the draft persists there.
 *   - **From the home page** — `matterId` omitted; step 2 shows a matter
 *     picker (defaulting to the user's Inbox). This lets you start a
 *     draft without first navigating into a case file.
 *
 * `seedTemplateId` skips step 1 when the caller already knows which
 * template they want (e.g. clicking a template card on the home page).
 *
 * On success the parent is notified via `onCreated` and is responsible
 * for navigating to the new document page.
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileText, Gavel, Scale, Send, Loader2 } from 'lucide-react';
import { useAuth, useUser } from '@clerk/clerk-react';
import type { DraftField as DraftFieldDef, DraftTemplate, PleadingDraftDocument } from '../types';
import { generatePleadingDraft, type GeneratePleadingDraftInput } from '../services/api';
import { loadDraftTemplates } from '../services/draftTemplates';
import { useMatters } from '../state/MattersContext';
import Dialog from './Dialog';
import DraftField from './DraftField';
import { Field } from './Field';
import { t } from '../design/tokens';

interface Props {
  open: boolean;
  /** Lock the draft to a specific matter. Omit to show a picker. */
  matterId?: string;
  /** Pre-select a template and skip step 1. */
  seedTemplateId?: string;
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

export default function NewDraftDialog({
  open,
  matterId,
  seedTemplateId,
  onClose,
  onCreated,
}: Props) {
  const { user } = useUser();
  const { getToken } = useAuth();
  const { matters, inboxMatter } = useMatters();

  const [templates, setTemplates] = useState<DraftTemplate[] | null>(null);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('pick');
  const [selected, setSelected] = useState<DraftTemplate | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  // Resolved at submit time. When the caller fixed a matter, this stays
  // pinned to that id; otherwise the user picks via the in-dialog select.
  const [chosenMatterId, setChosenMatterId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const matterPickerOptions = useMemo(() => {
    // Inbox first (default landing), then non-inbox by recency.
    const inbox = matters.filter(m => m.is_inbox);
    const rest = matters
      .filter(m => !m.is_inbox)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return [...inbox, ...rest];
  }, [matters]);

  // Load templates on open. Cached at the module level — repeated opens
  // don't re-fetch.
  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setValues({});
    setBusy(false);
    setSubmitError(null);
    setTemplatesError(null);
    setChosenMatterId(matterId ?? inboxMatter?.id ?? '');

    loadDraftTemplates(user?.id, () => getToken())
      .then(list => {
        setTemplates(list);
        // If a seed template was passed, jump straight to the fields form.
        if (seedTemplateId) {
          const seed = list.find(t_ => t_.id === seedTemplateId);
          if (seed) {
            seedSelection(seed);
            return;
          }
        }
        setStep('pick');
      })
      .catch(err => {
        setTemplatesError(
          err instanceof Error ? err.message : 'Could not load templates',
        );
      });
    // seedTemplateId / matterId / inboxMatter are open-time bindings; we
    // intentionally only reset on `open` flips so re-renders don't reset
    // mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const seedSelection = (tpl: DraftTemplate) => {
    setSelected(tpl);
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
    // If the dialog opened pre-seeded with a template, "Back" is a no-op
    // (there's no picker to return to in that mode); cancel the dialog.
    if (seedTemplateId) {
      onClose();
      return;
    }
    setStep('pick');
    setSelected(null);
    setSubmitError(null);
  };

  const updateField = (id: string, next: unknown) => {
    setValues(prev => ({ ...prev, [id]: next }));
  };

  const submit = async () => {
    if (!selected || busy) return;
    const targetMatter = chosenMatterId.trim();
    if (!targetMatter) {
      setSubmitError('Pick a matter to save the draft into.');
      return;
    }
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
      const doc = await generatePleadingDraft(targetMatter, input, user?.id, () => getToken());
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
          <TemplateGrid templates={templates} onChoose={seedSelection} />
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
          showMatterPicker={!matterId}
          matterOptions={matterPickerOptions}
          chosenMatterId={chosenMatterId}
          onChooseMatter={setChosenMatterId}
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
  showMatterPicker,
  matterOptions,
  chosenMatterId,
  onChooseMatter,
}: {
  fields: DraftFieldDef[];
  values: Record<string, unknown>;
  onChange: (id: string, next: unknown) => void;
  disabled: boolean;
  submitError: string | null;
  showMatterPicker: boolean;
  matterOptions: ReturnType<typeof useMatters>['matters'];
  chosenMatterId: string;
  onChooseMatter: (id: string) => void;
}) {
  return (
    <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: t.space.xs }}>
      {showMatterPicker && (
        <Field
          label="Save to matter"
          htmlFor="draft-matter-picker"
          hint="Defaults to your Inbox. Pick a specific case file if this draft belongs there."
        >
          <select
            id="draft-matter-picker"
            value={chosenMatterId}
            onChange={e => onChooseMatter(e.target.value)}
            disabled={disabled || matterOptions.length === 0}
            style={{
              display: 'block',
              width: '100%',
              fontFamily: 'inherit',
              fontSize: t.size.body,
              color: t.color.text,
              backgroundColor: t.color.surface,
              border: `1px solid ${t.color.border}`,
              borderRadius: t.radius.sm,
              padding: `${t.space.sm} ${t.space.md}`,
              outline: 'none',
              appearance: 'none',
            }}
          >
            {matterOptions.length === 0 && (
              <option value="">(no matters yet — create one first)</option>
            )}
            {matterOptions.map(m => (
              <option key={m.id} value={m.id}>
                {m.is_inbox ? `Inbox · ${m.title}` : m.title}
              </option>
            ))}
          </select>
        </Field>
      )}
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
