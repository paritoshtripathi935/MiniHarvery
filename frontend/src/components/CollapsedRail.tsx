/**
 * Thin vertical rail shown when a sidebar is collapsed.
 * Renders stacked icon buttons; clicking any one expands the parent sidebar.
 */
import type { LucideIcon } from 'lucide-react';
import { PanelLeftOpen, PanelRightOpen } from 'lucide-react';

export interface RailSection {
  icon: LucideIcon;
  label: string;
  count?: number;
  accent?: string;
}

interface Props {
  side: 'left' | 'right';
  sections: RailSection[];
  onExpand: () => void;
}

export default function CollapsedRail({ side, sections, onExpand }: Props) {
  const ExpandIcon = side === 'left' ? PanelLeftOpen : PanelRightOpen;
  const border = side === 'left' ? 'border-r' : 'border-l';

  return (
    <aside
      className={`flex flex-col items-center py-3 gap-2 ${border}`}
      style={{
        width: '48px',
        backgroundColor: 'var(--surface)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Expand button */}
      <button
        onClick={onExpand}
        className="w-9 h-9 rounded flex items-center justify-center cursor-pointer border-0 transition-colors hover:bg-[var(--surface-hover)]"
        style={{ backgroundColor: 'transparent', color: 'var(--text-muted)' }}
        title={`Expand ${side} panel`}
        aria-label={`Expand ${side} panel`}
      >
        <ExpandIcon size={15} />
      </button>

      <div className="w-6 border-t" style={{ borderColor: 'var(--border)' }} />

      {/* Section icons — click any to expand */}
      {sections.map(section => {
        const Icon = section.icon;
        return (
          <button
            key={section.label}
            onClick={onExpand}
            className="relative w-9 h-9 rounded flex items-center justify-center cursor-pointer border-0 transition-colors hover:bg-[var(--surface-hover)]"
            style={{
              backgroundColor: 'transparent',
              color: section.accent ?? 'var(--text-muted)',
            }}
            title={
              section.count !== undefined
                ? `${section.label} · ${section.count}`
                : section.label
            }
            aria-label={section.label}
          >
            <Icon size={14} />
            {section.count !== undefined && section.count > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 text-[9px] font-semibold px-1 rounded-full"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--bg)',
                  minWidth: '14px',
                  textAlign: 'center',
                  lineHeight: '14px',
                }}
              >
                {section.count}
              </span>
            )}
          </button>
        );
      })}
    </aside>
  );
}
