/**
 * Today — the landing route.
 *
 * Answers one question for an associate first thing in the morning:
 * "what should I look at right now?" Today shows recent matters
 * (sorted by activity) and a single primary CTA to start fresh research
 * inside Inbox.
 *
 * Designed-not-vibecoded principles applied:
 *  - One H1, one secondary section, no kitchen sink. Hearings + drafts-due
 *    widgets are intentionally NOT here — we don't have the data yet, and
 *    placeholders are worse than absence.
 *  - Empty state is real copy, not a "no matters yet" stare.
 *  - Recent matters truncate to 6; a "View all" link routes to /matters
 *    when there are more.
 */
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';
import { useMatters } from '../state/MattersContext';
import MatterCard from '../components/MatterCard';
import NewMatterButton from '../components/NewMatterButton';
import { Breadcrumbs, Crumb } from '../layout/Breadcrumbs';
import { t } from '../design/tokens';

const PREVIEW_LIMIT = 6;

export default function TodayPage() {
  const { matters, loaded, inboxMatter } = useMatters();
  const { user } = useUser();
  const navigate = useNavigate();

  const recent = matters
    .filter(m => !m.is_inbox)
    .slice(0, PREVIEW_LIMIT);

  const greeting = greetingFor(new Date(), user?.firstName ?? user?.fullName ?? null);

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
            <PrimaryActions inboxId={inboxMatter?.id ?? null} onCreated={(id) => navigate(`/matters/${id}`)} />
            {recent.length > 0 && (
              <RecentMattersSection
                matters={recent}
                hasMore={matters.filter(m => !m.is_inbox).length > PREVIEW_LIMIT}
              />
            )}
          </>
        )}
      </div>
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

function PrimaryActions({
  inboxId,
  onCreated,
}: {
  inboxId: string | null;
  onCreated: (id: string) => void;
}) {
  return (
    <div
      className="flex items-center"
      style={{ gap: t.space.sm, marginBottom: t.space.lg }}
    >
      <NewMatterButton variant="primary" onCreated={onCreated} />
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

function RecentMattersSection({
  matters,
  hasMore,
}: {
  matters: ReturnType<typeof useMatters>['matters'];
  hasMore: boolean;
}) {
  return (
    <section style={{ marginTop: t.space.lg }}>
      <div
        className="flex items-baseline justify-between"
        style={{ marginBottom: t.space.md }}
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
          Recent matters
        </h2>
        {hasMore && (
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
        )}
      </div>
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
