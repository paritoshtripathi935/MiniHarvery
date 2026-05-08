/**
 * AppLayout — chrome that wraps every signed-in route.
 *
 * Two columns: a slim NavRail on the left (Today / Matters / Inbox), and
 * the route's content on the right. Header is a breadcrumb + brand only;
 * the matter selector chip lives inside MatterDetailPage's own header,
 * not here, because it's only meaningful on a matter page.
 *
 * Why a NavRail instead of cramming nav into the existing left sidebar:
 * the sidebar inside a matter is full of matter-specific things (threads,
 * documents). Mixing top-level navigation with that creates the same
 * "everything competes for attention" problem we're moving away from.
 */
import { useEffect } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Scale, Home, Briefcase, Inbox } from 'lucide-react';
import { UserButton } from '@clerk/clerk-react';
import ThemeToggle from '../components/ThemeToggle';
import { useMatters } from '../state/MattersContext';
import { t } from '../design/tokens';

export default function AppLayout() {
  const { inboxMatter, loaded } = useMatters();
  const navigate = useNavigate();
  const location = useLocation();

  // /inbox is a friendly alias for the user's auto-Inbox matter. We
  // resolve the real id once matters have loaded and redirect.
  useEffect(() => {
    if (location.pathname === '/inbox' && loaded && inboxMatter) {
      navigate(`/matters/${inboxMatter.id}`, { replace: true });
    }
  }, [location.pathname, loaded, inboxMatter, navigate]);

  return (
    <div
      className="flex h-screen w-screen overflow-hidden"
      style={{ backgroundColor: t.color.bg, color: t.color.text }}
    >
      <NavRail />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar />
        <main className="flex-1 min-h-0 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavRail() {
  return (
    <aside
      className="flex flex-col items-stretch flex-shrink-0"
      style={{
        width: '184px',
        borderRight: `1px solid ${t.color.border}`,
        backgroundColor: t.color.surface,
        padding: t.space.md,
        gap: t.space.sm,
      }}
    >
      <div
        className="flex items-center"
        style={{ gap: t.space.sm, paddingBottom: t.space.lg }}
      >
        <Scale size={22} style={{ color: t.color.accent }} />
        <span
          className="serif"
          style={{
            fontSize: '22px',
            fontWeight: t.weight.semibold,
            color: t.color.accentBright,
            letterSpacing: '-0.01em',
          }}
        >
          Vidhi
        </span>
      </div>

      <NavItem to="/" icon={Home} label="Today" end />
      <NavItem to="/matters" icon={Briefcase} label="Matters" />
      <NavItem to="/inbox" icon={Inbox} label="Inbox" />

      <div className="flex-1" />

      <div
        className="flex items-center justify-between"
        style={{
          paddingTop: t.space.md,
          borderTop: `1px solid ${t.color.border}`,
        }}
      >
        <ThemeToggle />
        <UserButton afterSignOutUrl="/" />
      </div>
    </aside>
  );
}

function NavItem({
  to,
  icon: Icon,
  label,
  end,
}: {
  to: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  label: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className="no-underline"
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: t.space.sm,
        padding: `${t.space.sm} ${t.space.md}`,
        borderRadius: t.radius.md,
        fontSize: t.size.ui,
        fontWeight: t.weight.medium,
        color: isActive ? t.color.text : t.color.muted,
        backgroundColor: isActive ? t.color.hover : 'transparent',
        // Saffron left-bar marks the *active route* — one of the rare
        // places we use accent for state, not decoration.
        boxShadow: isActive ? `inset 3px 0 0 ${t.color.accent}` : 'none',
        transition: t.motion.fast,
      })}
    >
      {({ isActive }) => (
        <>
          <Icon
            size={15}
            style={{
              color: isActive ? t.color.accent : t.color.dim,
            }}
          />
          {label}
        </>
      )}
    </NavLink>
  );
}

function TopBar() {
  // Breadcrumbs live inside each page (they need page-specific data
  // like matter title). The TopBar exists mainly to give the chrome
  // a consistent height and reserve a slot for global actions later.
  return (
    <div
      className="flex items-center"
      style={{
        height: '48px',
        flexShrink: 0,
        padding: `0 ${t.space.lg}`,
        borderBottom: `1px solid ${t.color.border}`,
        backgroundColor: t.color.surface,
      }}
    >
      <Breadcrumbs />
    </div>
  );
}

function Breadcrumbs() {
  // Children render breadcrumb crumbs into a portal (#breadcrumb-slot);
  // pages put the slot's content via a hook in PageHeader components.
  return <div id="breadcrumb-slot" className="flex items-center min-w-0" />;
}
