/**
 * MatterTabs — primary navigation inside a matter.
 *
 * Tabs:
 *   Research   → the brief + composer + thread picker
 *   Documents  → case briefs, drafts, authorities (count badge)
 *   Settings   → matter metadata (parties, court, cause number, status)
 *
 * For now we keep tab state in the component's parent (MatterDetailPage)
 * rather than as URL sub-routes, to avoid bloating routing surface in
 * this iteration. Sub-routes (/matters/:id/documents) come once
 * Document detail pages exist.
 */
import type { ComponentType, CSSProperties } from 'react';
import { FileText, Settings, MessageSquareText } from 'lucide-react';
import { t } from '../design/tokens';

export type MatterTab = 'research' | 'documents' | 'settings';

interface Props {
  active: MatterTab;
  onChange: (tab: MatterTab) => void;
  documentCount: number;
}

interface TabDef {
  id: MatterTab;
  label: string;
  icon: ComponentType<{ size?: number; style?: CSSProperties }>;
  badge?: number;
}

export default function MatterTabs({ active, onChange, documentCount }: Props) {
  const tabs: TabDef[] = [
    { id: 'research', label: 'Research', icon: MessageSquareText },
    { id: 'documents', label: 'Documents', icon: FileText, badge: documentCount },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav
      className="flex items-center"
      style={{
        gap: t.space.md,
        padding: `0 ${t.space.lg}`,
        borderBottom: `1px solid ${t.color.border}`,
        backgroundColor: t.color.surface,
        flexShrink: 0,
      }}
    >
      {tabs.map(tab => {
        const isActive = tab.id === active;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className="inline-flex items-center cursor-pointer border-0 bg-transparent"
            style={{
              gap: t.space.xs,
              padding: `${t.space.sm} 0`,
              fontSize: t.size.ui,
              fontWeight: t.weight.medium,
              color: isActive ? t.color.text : t.color.muted,
              borderBottom: isActive
                ? `2px solid ${t.color.accent}`
                : '2px solid transparent',
              transition: t.motion.fast,
              marginBottom: '-1px',  // overlap the parent border so the
              //                       active underline replaces it
            }}
          >
            <Icon size={13} style={{ color: isActive ? t.color.accent : t.color.dim }} />
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span
                style={{
                  fontSize: t.size.micro,
                  color: isActive ? t.color.accent : t.color.dim,
                  fontVariantNumeric: 'tabular-nums',
                  marginLeft: '2px',
                }}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
