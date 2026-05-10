/**
 * NewDraftButton — primary entry point to drafting (PAI-11).
 *
 * Click the button → small popover lists the 4 templates as "draft via
 * chat" links and a separator-divided "Use the form instead" item. Each
 * template item navigates to the new full-page DraftingChatPage; the
 * form item invokes the consumer's `onUseForm` callback (which opens
 * the existing NewDraftDialog).
 *
 * Used by both TodayPage's quick action and MatterDetailPage's
 * Documents toolbar. Pass `matterId` to scope the chat to a matter; omit
 * for the matter-less /drafting/:templateId route.
 */
import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, FilePlus, FileText, Gavel, Scale, Send } from 'lucide-react';
import { useDismissable } from '../hooks/useDismissable';
import { t } from '../design/tokens';

type Variant = 'secondary' | 'primary';

interface Props {
  matterId?: string;
  onUseForm: () => void;
  variant?: Variant;
  label?: string;
}

const TEMPLATES: Array<{
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  { id: 'plaint', label: 'Plaint', icon: Scale },
  { id: 'writ_226', label: 'Writ Petition (Art. 226)', icon: Gavel },
  { id: 'anticipatory_bail', label: 'Anticipatory Bail', icon: FileText },
  { id: 'legal_notice', label: 'Legal Notice', icon: Send },
];

export default function NewDraftButton({
  matterId,
  onUseForm,
  variant = 'secondary',
  label = 'New draft',
}: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissable(wrapRef, open, close);

  const goToChat = (templateId: string) => {
    setOpen(false);
    const path = matterId
      ? `/matters/${matterId}/drafting/${templateId}`
      : `/drafting/${templateId}`;
    navigate(path);
  };

  const useForm = () => {
    setOpen(false);
    onUseForm();
  };

  const isPrimary = variant === 'primary';

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center cursor-pointer"
        style={{
          gap: t.space.xs,
          padding: `${t.space.sm} ${t.space.md}`,
          fontSize: t.size.ui,
          fontWeight: isPrimary ? t.weight.semibold : t.weight.medium,
          color: isPrimary ? t.color.bg : t.color.text,
          backgroundColor: isPrimary ? t.color.accent : 'transparent',
          border: isPrimary ? 'none' : `1px solid ${t.color.border}`,
          borderRadius: t.radius.md,
          transition: t.motion.fast,
        }}
        onMouseEnter={e => {
          if (!isPrimary) e.currentTarget.style.borderColor = t.color.accent;
        }}
        onMouseLeave={e => {
          if (!isPrimary) e.currentTarget.style.borderColor = t.color.border;
        }}
      >
        <FilePlus size={13} />
        {label}
        <ChevronDown size={12} style={{ marginLeft: '2px' }} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-30 overflow-hidden"
          style={{
            minWidth: '240px',
            backgroundColor: t.color.raised,
            border: `1px solid ${t.color.border}`,
            borderRadius: t.radius.md,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          }}
        >
          <div
            style={{
              padding: `${t.space.xs} ${t.space.md}`,
              fontSize: t.size.micro,
              color: t.color.muted,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              borderBottom: `1px solid ${t.color.border}`,
            }}
          >
            Draft via chat
          </div>
          {TEMPLATES.map(tpl => {
            const Icon = tpl.icon;
            return (
              <button
                key={tpl.id}
                onClick={() => goToChat(tpl.id)}
                className="w-full text-left flex items-center cursor-pointer border-0 bg-transparent"
                style={{
                  gap: t.space.sm,
                  padding: `${t.space.sm} ${t.space.md}`,
                  fontSize: t.size.ui,
                  color: t.color.text,
                  transition: t.motion.fast,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = t.color.hover;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <Icon size={13} />
                {tpl.label}
              </button>
            );
          })}
          <button
            onClick={useForm}
            className="w-full text-left flex items-center cursor-pointer border-0 bg-transparent"
            style={{
              gap: t.space.sm,
              padding: `${t.space.sm} ${t.space.md}`,
              fontSize: t.size.ui,
              color: t.color.muted,
              borderTop: `1px solid ${t.color.border}`,
              transition: t.motion.fast,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = t.color.hover;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            title="Open the classic form-style draft dialog"
          >
            <FilePlus size={13} />
            Use the form instead…
          </button>
        </div>
      )}
    </div>
  );
}
