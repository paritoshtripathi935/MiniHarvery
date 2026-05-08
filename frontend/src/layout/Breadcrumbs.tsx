/**
 * Breadcrumbs portal — pages render their crumbs *here* (#breadcrumb-slot)
 * via a portal, so the TopBar doesn't need to know about every page.
 *
 * Usage:
 *   <Breadcrumbs>
 *     <Crumb to="/matters">Matters</Crumb>
 *     <Crumb>{matterTitle}</Crumb>
 *   </Breadcrumbs>
 *
 * The last crumb is rendered as the current location (no link styling).
 */
import { createPortal } from 'react-dom';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { t } from '../design/tokens';

export function Breadcrumbs({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  // Slot may not exist on the first render pass (router is mounting);
  // useEffect waits for it. Without this we get a flash.
  useEffect(() => {
    setHost(document.getElementById('breadcrumb-slot'));
  }, []);
  if (!host) return null;
  return createPortal(
    <div
      className="flex items-center min-w-0"
      style={{ gap: t.space.xs, fontSize: t.size.ui, color: t.color.muted }}
    >
      {children}
    </div>,
    host,
  );
}

export function Crumb({
  to,
  children,
}: {
  to?: string;
  children: ReactNode;
}) {
  if (!to) {
    return (
      <span
        className="truncate"
        style={{
          color: t.color.text,
          fontWeight: t.weight.medium,
          maxWidth: '32ch',
        }}
      >
        {children}
      </span>
    );
  }
  return (
    <>
      <Link
        to={to}
        className="no-underline truncate"
        style={{
          color: t.color.muted,
          maxWidth: '20ch',
          transition: t.motion.fast,
        }}
        onMouseEnter={e => (e.currentTarget.style.color = t.color.text)}
        onMouseLeave={e => (e.currentTarget.style.color = t.color.muted)}
      >
        {children}
      </Link>
      <ChevronRight size={12} style={{ color: t.color.dim, flexShrink: 0 }} />
    </>
  );
}
