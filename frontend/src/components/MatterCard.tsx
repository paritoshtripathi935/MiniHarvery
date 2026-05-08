/**
 * MatterCard — single row in the matter list. Used on Today and on the
 * full Matters page. Click → navigate to /matters/:id.
 *
 * Density target: Linear-ish — efficient but airy. We pick a card per row
 * (rather than a tight table) because the metadata grid (parties, court,
 * cause number, last activity) reads better with a 2-column body than as
 * a single dense row.
 */
import { Link } from 'react-router-dom';
import { Briefcase, Inbox, FileText, MessageSquareText } from 'lucide-react';
import type { MatterSummary } from '../types';
import { t } from '../design/tokens';

interface Props {
  matter: MatterSummary;
}

export default function MatterCard({ matter }: Props) {
  const lead = matter.is_inbox ? Inbox : Briefcase;
  const LeadIcon = lead;

  return (
    <Link
      to={`/matters/${matter.id}`}
      className="no-underline block group"
      style={{
        backgroundColor: t.color.raised,
        border: `1px solid ${t.color.border}`,
        borderRadius: t.radius.md,
        padding: t.space.md,
        color: t.color.text,
        transition: t.motion.fast,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = t.color.accentSoft;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = t.color.border;
      }}
    >
      <div className="flex items-start" style={{ gap: t.space.md }}>
        <div
          className="flex-shrink-0 flex items-center justify-center"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: t.radius.sm,
            backgroundColor: matter.is_inbox ? t.color.hover : t.color.surface,
            color: matter.is_inbox ? t.color.accent : t.color.muted,
          }}
        >
          <LeadIcon size={16} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between" style={{ gap: t.space.md }}>
            <h3
              className="serif truncate m-0"
              style={{
                fontSize: t.size.h2,
                fontWeight: t.weight.semibold,
                color: t.color.text,
                letterSpacing: '-0.005em',
              }}
            >
              {matter.title}
            </h3>
            {!matter.is_inbox && matter.status !== 'active' && (
              <span
                style={{
                  fontSize: t.size.micro,
                  fontWeight: t.weight.medium,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: t.color.muted,
                  flexShrink: 0,
                }}
              >
                {matter.status}
              </span>
            )}
          </div>

          {(matter.court || matter.cause_number) && (
            <div
              className="truncate"
              style={{
                fontSize: t.size.ui,
                color: t.color.muted,
                marginTop: t.space.xs,
              }}
            >
              {[matter.court, matter.cause_number].filter(Boolean).join(' · ')}
            </div>
          )}

          {matter.parties.length > 0 && (
            <div
              className="truncate"
              style={{
                fontSize: t.size.micro,
                color: t.color.dim,
                marginTop: t.space.xs,
              }}
            >
              {matter.parties.map(p => p.name).join(' v. ')}
            </div>
          )}

          <div
            className="flex items-center"
            style={{
              gap: t.space.md,
              marginTop: t.space.sm,
              fontSize: t.size.micro,
              color: t.color.dim,
            }}
          >
            <span className="inline-flex items-center" style={{ gap: t.space.xs }}>
              <MessageSquareText size={11} />
              {matter.thread_count} {matter.thread_count === 1 ? 'thread' : 'threads'}
            </span>
            <span className="inline-flex items-center" style={{ gap: t.space.xs }}>
              <FileText size={11} />
              {matter.document_count}{' '}
              {matter.document_count === 1 ? 'document' : 'documents'}
            </span>
            <span style={{ marginLeft: 'auto' }}>
              {formatRelative(matter.updated_at)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
