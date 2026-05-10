/**
 * Today — the landing route, doubling as the discoverability surface.
 *
 * Sections, top to bottom:
 *   1. Greeting.
 *   2. Quick actions row — New matter, New draft (no matter required),
 *      Quick research in Inbox.
 *   3. Templates gallery — every drafting template surfaced as a clickable
 *      card so the user *sees* what Vidhi can do without burrowing into
 *      a matter's Documents tab first.
 *   4. Recent matters.
 *
 * Two design rules at work:
 *   - Saffron only for decisions: the New matter CTA is accent; templates
 *     are surface-on-surface; secondary actions are bordered.
 *   - No placeholder widgets. "Hearings this week" / "Drafts due today"
 *     are real ideas but we don't have the data — empty placeholders are
 *     worse than absence.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  FileText,
  Gavel,
  Scale,
  Send,
  Sparkles,
} from 'lucide-react';
import { useUser } from '@clerk/clerk-react';
import { useMatters } from '../state/MattersContext';
import MatterCard from '../components/MatterCard';
import NewMatterButton from '../components/NewMatterButton';
import NewDraftDialog from '../components/NewDraftDialog';
import NewDraftButton from '../components/NewDraftButton';
import { Breadcrumbs, Crumb } from '../layout/Breadcrumbs';
import { t } from '../design/tokens';

const PREVIEW_LIMIT = 6;

interface TemplateCard {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number }>;
}

// Mirror the backend's four templates. We don't fetch /draft-templates
// here on render — that would block the home page on a network call. The
// dialog itself fetches and is the source of truth for field schemas;
// these cards are just discoverability copy.
const TEMPLATE_CARDS: TemplateCard[] = [
  {
    id: 'plaint',
    label: 'Plaint',
    description: 'CPC O.VII — initiate a civil suit.',
    icon: Scale,
  },
  {
    id: 'writ_226',
    label: 'Writ Petition',
    description: 'Article 226 — fundamental rights, illegal state action.',
    icon: Gavel,
  },
  {
    id: 'anticipatory_bail',
    label: 'Anticipatory Bail',
    description: 'CrPC s.438 — pre-arrest bail application.',
    icon: FileText,
  },
  {
    id: 'legal_notice',
    label: 'Legal Notice',
    description: 'Pre-litigation correspondence with a stated demand.',
    icon: Send,
  },
];

export default function TodayPage() {
  const { matters, loaded, inboxMatter } = useMatters();
  const { user } = useUser();
  const navigate = useNavigate();

  const [draftDialog, setDraftDialog] = useState<
    { open: false } | { open: true; templateId?: string }
  >({ open: false });

  const recent = matters.filter(m => !m.is_inbox).slice(0, PREVIEW_LIMIT);
  const greeting = greetingFor(new Date(), user?.firstName ?? user?.fullName ?? null);

  const openDraftDialog = (templateId?: string) =>
    setDraftDialog({ open: true, templateId });
  const closeDraftDialog = () => setDraftDialog({ open: false });

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ padding: `${t.space.lg} ${t.space.xl}` }}
    >
      <Breadcrumbs>
        <Crumb>Today</Crumb>
      </Breadcrumbs>

      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <Header greeting={greeting} />

        {loaded && matters.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <QuickActions
              inboxId={inboxMatter?.id ?? null}
              onCreated={id => navigate(`/matters/${id}`)}
              onNewDraft={() => openDraftDialog()}
            />
            <TemplatesGallery
              onChooseChat={tplId => navigate(`/drafting/${tplId}`)}
              onUseForm={() => openDraftDialog()}
            />
            {recent.length > 0 && (
              <RecentMattersSection
                matters={recent}
                hasMore={matters.filter(m => !m.is_inbox).length > PREVIEW_LIMIT}
              />
            )}
          </>
        )}
      </div>

      <NewDraftDialog
        open={draftDialog.open}
        seedTemplateId={draftDialog.open ? draftDialog.templateId : undefined}
        onClose={closeDraftDialog}
        onCreated={doc => {
          closeDraftDialog();
          navigate(`/matters/${doc.matter_id}/documents/${doc.id}`);
        }}
      />
    </div>
  );
}

function greetingFor(now: Date, name: string | null): string {
  const h = now.getHours();
  const slot = h < 5 ? 'Late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  if (!name) return slot + '.';
  return `${slot}, ${name}.`;
}

function Header({ greeting }: { greeting: string }) {
  return (
    <header style={{ marginBottom: t.space.lg }}>
      <h1
        className="serif m-0"
        style={{
          fontSize: t.size.h1,
          fontWeight: t.weight.semibold,
          color: t.color.text,
          letterSpacing: '-0.015em',
          lineHeight: 1.15,
        }}
      >
        {greeting}
      </h1>
      <p
        className="m-0"
        style={{
          fontSize: t.size.body,
          color: t.color.muted,
          marginTop: t.space.xs,
        }}
      >
        Pick up where you left off — or start something new.
      </p>
    </header>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        marginTop: t.space.xl,
        padding: `${t.space.xl} ${t.space.lg}`,
        border: `1px dashed ${t.color.border}`,
        borderRadius: t.radius.md,
        textAlign: 'center',
      }}
    >
      <Sparkles size={20} style={{ color: t.color.accent, margin: '0 auto' }} />
      <h2
        className="serif m-0"
        style={{
          fontSize: t.size.h2,
          fontWeight: t.weight.semibold,
          color: t.color.text,
          marginTop: t.space.md,
        }}
      >
        Welcome to Vidhi.
      </h2>
      <p
        className="m-0"
        style={{
          fontSize: t.size.body,
          color: t.color.muted,
          marginTop: t.space.sm,
          maxWidth: '52ch',
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      >
        Your matters live here. Each matter holds the threads, briefs, and
        drafts for one case file. Start with a quick research session in
        your Inbox, or set up your first matter.
      </p>
      <div
        className="flex items-center justify-center"
        style={{ gap: t.space.sm, marginTop: t.space.lg }}
      >
        <NewMatterButton variant="primary" />
        <Link
          to="/inbox"
          className="no-underline"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: t.space.xs,
            padding: `${t.space.sm} ${t.space.md}`,
            fontSize: t.size.ui,
            fontWeight: t.weight.medium,
            color: t.color.muted,
          }}
        >
          Start in Inbox <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
}

function QuickActions({
  inboxId,
  onCreated,
  onNewDraft,
}: {
  inboxId: string | null;
  onCreated: (id: string) => void;
  onNewDraft: () => void;
}) {
  return (
    <div
      className="flex items-center"
      style={{ gap: t.space.sm, marginBottom: t.space.lg, flexWrap: 'wrap' }}
    >
      <NewMatterButton variant="primary" onCreated={onCreated} />
      <NewDraftButton onUseForm={onNewDraft} />
      {inboxId && (
        <Link
          to={`/matters/${inboxId}`}
          className="no-underline inline-flex items-center"
          style={{
            gap: t.space.xs,
            padding: `${t.space.sm} ${t.space.md}`,
            fontSize: t.size.ui,
            fontWeight: t.weight.medium,
            color: t.color.muted,
            border: `1px solid ${t.color.border}`,
            borderRadius: t.radius.md,
            transition: t.motion.fast,
          }}
        >
          Quick research in Inbox <ArrowRight size={13} />
        </Link>
      )}
    </div>
  );
}

function TemplatesGallery({
  onChooseChat,
  onUseForm,
}: {
  onChooseChat: (templateId: string) => void;
  onUseForm: () => void;
}) {
  return (
    <section style={{ marginBottom: t.space.lg }}>
      <SectionHeader
        eyebrow="Drafting templates"
        hint="Click a template to draft via chat. Vidhi asks for the details and produces the document."
        action={
          <button
            onClick={onUseForm}
            className="cursor-pointer border-0 bg-transparent"
            style={{
              fontSize: t.size.ui,
              color: t.color.muted,
              padding: 0,
              textDecoration: 'underline',
              textDecorationColor: t.color.border,
              textUnderlineOffset: '3px',
            }}
            title="Open the classic form-style draft dialog"
          >
            Prefer the form? →
          </button>
        }
      />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: t.space.sm,
        }}
      >
        {TEMPLATE_CARDS.map(tpl => {
          const Icon = tpl.icon;
          return (
            <button
              key={tpl.id}
              onClick={() => onChooseChat(tpl.id)}
              className="cursor-pointer text-left border-0"
              style={{
                padding: t.space.md,
                backgroundColor: t.color.surface,
                border: `1px solid ${t.color.border}`,
                borderRadius: t.radius.md,
                display: 'flex',
                flexDirection: 'column',
                gap: t.space.xs,
                minHeight: '100px',
                transition: t.motion.fast,
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
                style={{ gap: t.space.xs }}
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
                style={{
                  fontSize: t.size.ui,
                  color: t.color.muted,
                  lineHeight: 1.45,
                }}
              >
                {tpl.description}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function RecentMattersSection({
  matters,
  hasMore,
}: {
  matters: ReturnType<typeof useMatters>['matters'];
  hasMore: boolean;
}) {
  return (
    <section style={{ marginTop: t.space.lg }}>
      <SectionHeader
        eyebrow="Recent matters"
        action={
          hasMore ? (
            <Link
              to="/matters"
              className="no-underline"
              style={{
                fontSize: t.size.ui,
                color: t.color.accent,
                fontWeight: t.weight.medium,
              }}
            >
              View all →
            </Link>
          ) : null
        }
      />
      <div
        className="grid"
        style={{
          gridTemplateColumns: '1fr',
          gap: t.space.sm,
        }}
      >
        {matters.map(m => (
          <MatterCard key={m.id} matter={m} />
        ))}
      </div>
    </section>
  );
}

function SectionHeader({
  eyebrow,
  hint,
  action,
}: {
  eyebrow: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-baseline justify-between"
      style={{ marginBottom: t.space.md, gap: t.space.md }}
    >
      <div>
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
          {eyebrow}
        </h2>
        {hint && (
          <p
            className="m-0"
            style={{
              fontSize: t.size.micro,
              color: t.color.dim,
              marginTop: '2px',
            }}
          >
            {hint}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
