/**
 * DraftingChatPage — full-page conversational drafting (PAI-11).
 *
 * URL patterns:
 *   /drafting/:templateId
 *   /matters/:matterId/drafting/:templateId
 *
 * What it does: collects the template's required fields via a chat-style
 * interaction. The LLM extracts what it can from each user reply and
 * asks a natural-language question for whatever is still missing. When
 * every required field is filled, the user clicks "Generate draft" and
 * we hit the existing /matters/:id/drafts endpoint to actually produce
 * the markdown.
 *
 * Stateless server-side: the FE owns the message history and the running
 * extracted-fields map and re-sends both per turn. Refresh = lose chat,
 * but the draft persists as a Document the moment the user generates.
 *
 * The classic NewDraftDialog form remains reachable via the "Use the
 * form instead" link in the footer for users who'd rather fill a form.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth, useUser } from '@clerk/clerk-react';
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Loader2,
  Send,
  Sparkles,
} from 'lucide-react';
import {
  draftingTurn,
  generatePleadingDraft,
  type DraftingChatMessage,
} from '../services/api';
import { loadDraftTemplates } from '../services/draftTemplates';
import type { DraftField, DraftTemplate, PleadingDraftDocument } from '../types';
import { useMatters } from '../state/MattersContext';
import { Breadcrumbs, Crumb } from '../layout/Breadcrumbs';
import NewDraftDialog from '../components/NewDraftDialog';
import { t } from '../design/tokens';

type AssistantMessage = { role: 'assistant'; content: string; system?: boolean };
type UserMessage = { role: 'user'; content: string };
type ChatMessage = AssistantMessage | UserMessage;

// Static openings — mirror backend `drafting_conversation.opening_message`.
// Hard-coded on both ends so first paint doesn't need a server round-trip.
const OPENINGS: Record<string, string> = {
  plaint:
    "Let's draft a Plaint. Tell me what the dispute is about — who the parties are, and what relief your client is seeking.",
  writ_226:
    "Let's draft a Writ Petition under Article 226. What State action are you challenging, and which fundamental rights are engaged?",
  anticipatory_bail:
    "Let's draft an anticipatory bail application. What FIR has been registered, and what are the allegations against your client?",
  legal_notice:
    "Let's draft a Legal Notice. Who is it going to, and on whose behalf? What's the issue?",
};

export default function DraftingChatPage() {
  const { templateId = '', matterId } = useParams<{
    templateId: string;
    matterId?: string;
  }>();
  const navigate = useNavigate();
  const { user } = useUser();
  const { getToken } = useAuth();
  const { matters, inboxMatter } = useMatters();

  const [template, setTemplate] = useState<DraftTemplate | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [extracted, setExtracted] = useState<Record<string, unknown>>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [allReady, setAllReady] = useState(false);

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline matter picker — only shown when no matter is in the URL
  const [chosenMatterId, setChosenMatterId] = useState<string>('');
  const [showFormDialog, setShowFormDialog] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Load the template + seed the opening message.
  useEffect(() => {
    if (!templateId) return;
    let cancelled = false;
    setTemplateError(null);

    loadDraftTemplates(user?.id, () => getToken())
      .then(list => {
        if (cancelled) return;
        const found = list.find(t_ => t_.id === templateId);
        if (!found) {
          setTemplateError(`Unknown template "${templateId}"`);
          return;
        }
        setTemplate(found);
        const opening =
          OPENINGS[found.id] ??
          `Let's draft a ${found.label}. Tell me what the matter is about.`;
        setMessages([{ role: 'assistant', content: opening }]);
      })
      .catch(err => {
        if (!cancelled) {
          setTemplateError(
            err instanceof Error ? err.message : 'Could not load template',
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [templateId, user?.id, getToken]);

  // Default the matter picker to Inbox once matters are loaded.
  useEffect(() => {
    if (matterId) {
      setChosenMatterId(matterId);
      return;
    }
    if (!chosenMatterId && inboxMatter) setChosenMatterId(inboxMatter.id);
  }, [matterId, inboxMatter, chosenMatterId]);

  // Auto-scroll the chat to the latest turn.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  const matterPickerOptions = useMemo(() => {
    const inbox = matters.filter(m => m.is_inbox);
    const rest = matters
      .filter(m => !m.is_inbox)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return [...inbox, ...rest];
  }, [matters]);

  const matterContextSummary =
    matters.find(m => m.id === matterId) ?? null;

  // Send a turn: append user message, call /drafting/turn, append the
  // assistant reply, update extracted fields. Errors append a system-
  // styled assistant message rather than crashing the page.
  const sendTurn = useCallback(
    async (text: string) => {
      if (!template) return;
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      const nextHistory: ChatMessage[] = [
        ...messages,
        { role: 'user', content: trimmed },
      ];
      setMessages(nextHistory);
      setInput('');
      setSending(true);
      setError(null);

      try {
        const wireHistory: DraftingChatMessage[] = nextHistory.map(m => ({
          role: m.role,
          content: m.content,
        }));
        const reply = await draftingTurn(
          template.id,
          wireHistory,
          extracted,
          user?.id,
          () => getToken(),
        );
        setExtracted(reply.extracted_fields);
        setMissing(reply.missing_required);
        setAllReady(reply.kind === 'ready');
        const assistantText =
          reply.kind === 'ready'
            ? "I have everything I need. Ready to generate the draft when you are."
            : reply.question ?? '…';
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: assistantText },
        ]);
      } catch (err) {
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content:
              err instanceof Error
                ? err.message
                : 'Something went wrong. Please try again.',
            system: true,
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [template, messages, extracted, sending, user?.id, getToken],
  );

  const onGenerate = useCallback(async () => {
    if (!template || generating) return;
    const target = chosenMatterId.trim();
    if (!target) {
      setError('Pick a matter to save the draft into.');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const { document } = await generatePleadingDraft(
        target,
        { template_id: template.id, fields: extracted },
        user?.id,
        () => getToken(),
      );
      navigate(`/matters/${document.matter_id}/documents/${document.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Draft generation failed.',
      );
      setGenerating(false);
    }
  }, [template, generating, chosenMatterId, extracted, user?.id, getToken, navigate]);

  // ── Renders ────────────────────────────────────────────────────────────

  if (templateError) {
    return (
      <div style={{ padding: t.space.xl, color: t.color.danger }}>
        {templateError}{' '}
        <button onClick={() => navigate('/')} style={linkBtn}>
          ← Today
        </button>
      </div>
    );
  }
  if (!template) {
    return (
      <div style={{ padding: t.space.xl, color: t.color.muted }}>
        Loading template…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Breadcrumbs>
        <Crumb to={matterContextSummary?.is_inbox ? '/' : '/matters'}>
          {matterContextSummary?.is_inbox ? 'Today' : 'Matters'}
        </Crumb>
        {matterContextSummary && (
          <Crumb to={`/matters/${matterContextSummary.id}`}>
            {matterContextSummary.title}
          </Crumb>
        )}
        <Crumb>Drafting · {template.label}</Crumb>
      </Breadcrumbs>

      <Header
        template={template}
        onBack={() =>
          matterContextSummary
            ? navigate(`/matters/${matterContextSummary.id}`)
            : navigate('/')
        }
      />

      <div
        className="flex-1 flex overflow-hidden"
        style={{ backgroundColor: t.color.bg }}
      >
        <ChatColumn
          scrollRef={scrollRef}
          messages={messages}
          sending={sending}
          input={input}
          onInputChange={setInput}
          onSend={() => void sendTurn(input)}
          onUseForm={() => setShowFormDialog(true)}
        />
        <FieldsPanel
          template={template}
          extracted={extracted}
          missing={missing}
          allReady={allReady}
          generating={generating}
          error={error}
          showMatterPicker={!matterId}
          matterOptions={matterPickerOptions}
          chosenMatterId={chosenMatterId}
          onChooseMatter={setChosenMatterId}
          onGenerate={() => void onGenerate()}
        />
      </div>

      <NewDraftDialog
        open={showFormDialog}
        matterId={matterId}
        seedTemplateId={template.id}
        onClose={() => setShowFormDialog(false)}
        onCreated={(doc: PleadingDraftDocument) => {
          setShowFormDialog(false);
          navigate(`/matters/${doc.matter_id}/documents/${doc.id}`);
        }}
      />
    </div>
  );
}

// ─── Header ────────────────────────────────────────────────────────────────

function Header({
  template,
  onBack,
}: {
  template: DraftTemplate;
  onBack: () => void;
}) {
  return (
    <header
      className="flex items-center flex-shrink-0"
      style={{
        gap: t.space.md,
        padding: `${t.space.md} ${t.space.lg}`,
        backgroundColor: t.color.surface,
        borderBottom: `1px solid ${t.color.border}`,
      }}
    >
      <button
        onClick={onBack}
        className="cursor-pointer border-0 bg-transparent flex items-center justify-center"
        style={{
          width: '32px',
          height: '32px',
          borderRadius: t.radius.sm,
          color: t.color.muted,
          transition: t.motion.fast,
        }}
        title="Back"
      >
        <ArrowLeft size={16} />
      </button>
      <span
        style={{
          padding: `2px ${t.space.sm}`,
          fontSize: t.size.micro,
          fontWeight: t.weight.semibold,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: t.color.bg,
          backgroundColor: t.color.accent,
          borderRadius: t.radius.sm,
        }}
      >
        Drafting
      </span>
      <div className="flex flex-col">
        <h1
          className="serif m-0"
          style={{
            fontSize: t.size.h2,
            fontWeight: t.weight.semibold,
            color: t.color.text,
            lineHeight: 1.2,
          }}
        >
          {template.label}
        </h1>
        <span style={{ fontSize: t.size.micro, color: t.color.dim }}>
          {template.description}
        </span>
      </div>
    </header>
  );
}

// ─── Chat column ───────────────────────────────────────────────────────────

function ChatColumn({
  scrollRef,
  messages,
  sending,
  input,
  onInputChange,
  onSend,
  onUseForm,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  messages: ChatMessage[];
  sending: boolean;
  input: string;
  onInputChange: (next: string) => void;
  onSend: () => void;
  onUseForm: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col" style={{ minWidth: 0 }}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div
          style={{
            maxWidth: '720px',
            margin: '0 auto',
            padding: `${t.space.lg} ${t.space.xl}`,
            display: 'flex',
            flexDirection: 'column',
            gap: t.space.md,
          }}
        >
          {messages.map((m, i) => (
            <MessageBubble key={i} message={m} />
          ))}
          {sending && <ThinkingBubble />}
        </div>
      </div>

      <div
        className="flex-shrink-0"
        style={{
          backgroundColor: t.color.surface,
          borderTop: `1px solid ${t.color.border}`,
          padding: t.space.md,
        }}
      >
        <div
          style={{
            maxWidth: '720px',
            margin: '0 auto',
            display: 'flex',
            gap: t.space.sm,
            alignItems: 'flex-end',
          }}
        >
          <textarea
            value={input}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="Type your reply… (Enter to send, Shift+Enter for newline)"
            rows={2}
            disabled={sending}
            style={{
              flex: 1,
              resize: 'vertical',
              fontFamily: 'inherit',
              fontSize: t.size.body,
              color: t.color.text,
              backgroundColor: t.color.bg,
              border: `1px solid ${t.color.border}`,
              borderRadius: t.radius.md,
              padding: t.space.sm,
              outline: 'none',
              minHeight: '52px',
              maxHeight: '180px',
            }}
          />
          <button
            onClick={onSend}
            disabled={sending || !input.trim()}
            className="inline-flex items-center cursor-pointer border-0 disabled:cursor-not-allowed"
            style={{
              gap: t.space.xs,
              padding: `${t.space.sm} ${t.space.md}`,
              fontSize: t.size.ui,
              fontWeight: t.weight.semibold,
              color: t.color.bg,
              backgroundColor:
                sending || !input.trim() ? t.color.muted : t.color.accent,
              borderRadius: t.radius.md,
              transition: t.motion.fast,
              alignSelf: 'stretch',
            }}
          >
            <Send size={13} /> Send
          </button>
        </div>
        <div
          style={{
            maxWidth: '720px',
            margin: `${t.space.xs} auto 0`,
            fontSize: t.size.micro,
            color: t.color.dim,
          }}
        >
          <button
            onClick={onUseForm}
            className="cursor-pointer border-0 bg-transparent"
            style={{
              fontSize: t.size.micro,
              color: t.color.muted,
              padding: 0,
              textDecoration: 'underline',
              textDecorationColor: t.color.border,
              textUnderlineOffset: '3px',
            }}
            title="Open the classic form-style draft dialog"
          >
            Use the form instead
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const isSystem = !isUser && (message as AssistantMessage).system;
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      <div
        style={{
          maxWidth: '85%',
          padding: `${t.space.sm} ${t.space.md}`,
          fontSize: t.size.body,
          lineHeight: 1.55,
          borderRadius: t.radius.md,
          backgroundColor: isUser
            ? t.color.accent
            : isSystem
              ? 'transparent'
              : t.color.surface,
          color: isUser ? t.color.bg : isSystem ? t.color.danger : t.color.text,
          border: isSystem
            ? `1px dashed ${t.color.danger}`
            : isUser
              ? 'none'
              : `1px solid ${t.color.border}`,
          whiteSpace: 'pre-wrap',
        }}
      >
        {message.content}
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div style={{ display: 'flex' }}>
      <div
        className="inline-flex items-center"
        style={{
          gap: t.space.xs,
          padding: `${t.space.sm} ${t.space.md}`,
          fontSize: t.size.ui,
          color: t.color.muted,
          backgroundColor: t.color.surface,
          border: `1px solid ${t.color.border}`,
          borderRadius: t.radius.md,
        }}
      >
        <Loader2 size={13} className="animate-spin" />
        Thinking…
      </div>
    </div>
  );
}

// ─── Right-side fields panel ───────────────────────────────────────────────

function FieldsPanel({
  template,
  extracted,
  missing,
  allReady,
  generating,
  error,
  showMatterPicker,
  matterOptions,
  chosenMatterId,
  onChooseMatter,
  onGenerate,
}: {
  template: DraftTemplate;
  extracted: Record<string, unknown>;
  missing: string[];
  allReady: boolean;
  generating: boolean;
  error: string | null;
  showMatterPicker: boolean;
  matterOptions: ReturnType<typeof useMatters>['matters'];
  chosenMatterId: string;
  onChooseMatter: (id: string) => void;
  onGenerate: () => void;
}) {
  const required = template.fields.filter(f => f.required);
  const filledRequired = required.filter(f => isFilled(f, extracted[f.id]));
  const filledOptional = template.fields.filter(
    f => !f.required && isFilled(f, extracted[f.id]),
  );

  // Locally-derived "ready" — UX should let the user generate the moment
  // every required field is filled, even before the next turn confirms.
  const localReady = allReady || missing.length === 0;
  const canGenerate = localReady && filledRequired.length === required.length;

  return (
    <aside
      className="flex-shrink-0 flex flex-col overflow-hidden"
      style={{
        width: '320px',
        backgroundColor: t.color.surface,
        borderLeft: `1px solid ${t.color.border}`,
      }}
    >
      <div
        className="flex-shrink-0"
        style={{
          padding: `${t.space.md} ${t.space.lg}`,
          borderBottom: `1px solid ${t.color.border}`,
        }}
      >
        <h2
          className="m-0"
          style={{
            fontSize: t.size.ui,
            fontWeight: t.weight.semibold,
            color: t.color.muted,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
          }}
        >
          Collected
        </h2>
        <p
          className="m-0"
          style={{
            fontSize: t.size.micro,
            color: t.color.dim,
            marginTop: '2px',
          }}
        >
          {filledRequired.length}/{required.length} required ·{' '}
          {filledOptional.length} optional
        </p>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: t.space.lg }}>
        {template.fields.map(field => {
          const value = extracted[field.id];
          const filled = isFilled(field, value);
          return (
            <FieldRow
              key={field.id}
              field={field}
              value={value}
              filled={filled}
            />
          );
        })}
      </div>

      <div
        className="flex-shrink-0"
        style={{
          padding: t.space.lg,
          borderTop: `1px solid ${t.color.border}`,
          backgroundColor: t.color.bg,
        }}
      >
        {showMatterPicker && (
          <label
            style={{
              display: 'block',
              fontSize: t.size.micro,
              color: t.color.muted,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              marginBottom: t.space.xs,
            }}
          >
            Save to matter
            <select
              value={chosenMatterId}
              onChange={e => onChooseMatter(e.target.value)}
              disabled={matterOptions.length === 0}
              style={{
                display: 'block',
                width: '100%',
                marginTop: '4px',
                fontFamily: 'inherit',
                fontSize: t.size.body,
                color: t.color.text,
                backgroundColor: t.color.surface,
                border: `1px solid ${t.color.border}`,
                borderRadius: t.radius.sm,
                padding: `${t.space.xs} ${t.space.sm}`,
                outline: 'none',
              }}
            >
              {matterOptions.length === 0 && (
                <option value="">(no matters yet)</option>
              )}
              {matterOptions.map(m => (
                <option key={m.id} value={m.id}>
                  {m.is_inbox ? `Inbox · ${m.title}` : m.title}
                </option>
              ))}
            </select>
          </label>
        )}

        <button
          onClick={onGenerate}
          disabled={!canGenerate || generating}
          className="inline-flex items-center justify-center cursor-pointer border-0 disabled:cursor-not-allowed"
          style={{
            width: '100%',
            gap: t.space.xs,
            padding: `${t.space.sm} ${t.space.md}`,
            fontSize: t.size.ui,
            fontWeight: t.weight.semibold,
            color: canGenerate ? t.color.bg : t.color.muted,
            backgroundColor: canGenerate
              ? t.color.accent
              : t.color.hover,
            borderRadius: t.radius.md,
            transition: t.motion.fast,
            marginTop: showMatterPicker ? t.space.sm : 0,
          }}
        >
          {generating ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              Generating draft…
            </>
          ) : (
            <>
              <Sparkles size={13} />
              {canGenerate ? 'Generate draft' : 'Keep chatting to fill required fields'}
            </>
          )}
        </button>
        {error && (
          <p
            className="m-0"
            style={{
              fontSize: t.size.micro,
              color: t.color.danger,
              marginTop: t.space.xs,
            }}
          >
            {error}
          </p>
        )}
      </div>
    </aside>
  );
}

function FieldRow({
  field,
  value,
  filled,
}: {
  field: DraftField;
  value: unknown;
  filled: boolean;
}) {
  const Icon = filled ? CheckCircle2 : Circle;
  const summary = filled ? formatValue(field, value) : '— pending —';
  return (
    <div
      style={{
        display: 'flex',
        gap: t.space.sm,
        padding: `${t.space.xs} 0`,
      }}
    >
      <Icon
        size={13}
        style={{
          color: filled ? t.color.accent : t.color.dim,
          flexShrink: 0,
          marginTop: '3px',
        }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: t.size.micro,
            color: t.color.muted,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          {field.label}
          {field.required && (
            <span style={{ color: t.color.accent, marginLeft: '4px' }}>·</span>
          )}
        </div>
        <div
          style={{
            fontSize: t.size.ui,
            color: filled ? t.color.text : t.color.dim,
            lineHeight: 1.45,
            marginTop: '2px',
            wordBreak: 'break-word',
          }}
        >
          {summary}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function isFilled(field: DraftField, value: unknown): boolean {
  if (field.type === 'list') {
    return Array.isArray(value) && value.length > 0;
  }
  return typeof value === 'string' && value.trim().length > 0;
}

function formatValue(field: DraftField, value: unknown): string {
  if (field.type === 'list' && Array.isArray(value)) {
    return value.map(String).join(' · ');
  }
  if (typeof value === 'string') return value;
  return String(value);
}

const linkBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: t.color.accent,
  cursor: 'pointer',
  fontSize: t.size.ui,
};
