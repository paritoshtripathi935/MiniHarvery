import { useCallback, useRef, useState, type ComponentType } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useDismissable } from '../hooks/useDismissable';
import { t } from '../design/tokens';

export interface MenuItem {
  label: string;
  onClick: () => void;
  /** Render in danger color (used for delete/destroy actions). */
  danger?: boolean;
  /** Optional leading icon. */
  icon?: ComponentType<{ size?: number }>;
}

interface Props {
  items: MenuItem[];
  /** Override the trigger glyph; defaults to `MoreHorizontal`. */
  triggerIcon?: ComponentType<{ size?: number }>;
  /** Tooltip on the trigger. */
  title?: string;
}

/**
 * Icon-button-with-popover menu. The trigger is a 28px-square circle; the
 * popover hangs from its bottom-right with the project's standard shadow.
 */
export default function MoreMenu({
  items,
  triggerIcon: TriggerIcon = MoreHorizontal,
  title = 'More',
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissable(wrapRef, open, close);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="cursor-pointer border-0 bg-transparent flex items-center justify-center"
        style={{
          width: '28px',
          height: '28px',
          borderRadius: t.radius.sm,
          color: t.color.muted,
          transition: t.motion.fast,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.backgroundColor = t.color.hover;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
        title={title}
        aria-label={title}
      >
        <TriggerIcon size={15} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-30 overflow-hidden"
          style={{
            minWidth: '180px',
            backgroundColor: t.color.raised,
            border: `1px solid ${t.color.border}`,
            borderRadius: t.radius.md,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          }}
        >
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={i}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className="w-full text-left flex items-center cursor-pointer border-0 bg-transparent"
                style={{
                  gap: t.space.sm,
                  padding: `${t.space.sm} ${t.space.md}`,
                  fontSize: t.size.ui,
                  color: item.danger ? t.color.danger : t.color.text,
                  transition: t.motion.fast,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = t.color.hover;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {Icon && <Icon size={13} />}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
