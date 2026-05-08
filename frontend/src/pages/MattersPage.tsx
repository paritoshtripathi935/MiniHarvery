/**
 * Matters — full list of the user's case files.
 *
 * Currently a single sorted list; once volume justifies it, status
 * filters (Active / Closed / Archived) and a search box land in the
 * header here. We deliberately don't ship the filters as a row of
 * empty pills today — placeholder UI is a vibecoded tell.
 */
import { useNavigate } from 'react-router-dom';
import { useMatters } from '../state/MattersContext';
import MatterCard from '../components/MatterCard';
import NewMatterButton from '../components/NewMatterButton';
import { Breadcrumbs, Crumb } from '../layout/Breadcrumbs';
import { t } from '../design/tokens';

export default function MattersPage() {
  const { matters, loaded } = useMatters();
  const navigate = useNavigate();

  // Inbox always pinned at top; the rest sorted by recent activity
  // (the API already returns them updated_at-desc, with Inbox first).
  return (
    <div
      className="h-full overflow-y-auto"
      style={{ padding: `${t.space.lg} ${t.space.xl}` }}
    >
      <Breadcrumbs>
        <Crumb>Matters</Crumb>
      </Breadcrumbs>

      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <header
          className="flex items-end justify-between"
          style={{ marginBottom: t.space.lg, gap: t.space.md }}
        >
          <div>
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
              Matters
            </h1>
            <p
              className="m-0"
              style={{
                fontSize: t.size.body,
                color: t.color.muted,
                marginTop: t.space.xs,
              }}
            >
              {matters.length === 0
                ? 'No matters yet.'
                : `${matters.length} ${matters.length === 1 ? 'matter' : 'matters'}.`}
            </p>
          </div>
          <NewMatterButton
            variant="primary"
            onCreated={id => navigate(`/matters/${id}`)}
          />
        </header>

        {!loaded ? (
          <p style={{ color: t.color.muted, fontSize: t.size.ui }}>
            Loading…
          </p>
        ) : matters.length === 0 ? (
          <div
            style={{
              padding: `${t.space.xl} ${t.space.lg}`,
              border: `1px dashed ${t.color.border}`,
              borderRadius: t.radius.md,
              textAlign: 'center',
              color: t.color.muted,
              fontSize: t.size.body,
            }}
          >
            Create your first matter to start organising research
            and documents around a case.
          </div>
        ) : (
          <div
            className="grid"
            style={{ gridTemplateColumns: '1fr', gap: t.space.sm }}
          >
            {matters.map(m => (
              <MatterCard key={m.id} matter={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
