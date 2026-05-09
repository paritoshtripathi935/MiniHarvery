/**
 * NewMatterButton — single source of truth for the "create matter" UX.
 * Used on Today (primary), MattersPage (primary), and inside the matter
 * selector dropdown (inline).
 *
 * Click → small inline form (title only). Sub-fields like court, parties,
 * cause number live on /matters/:id/settings — adding them up-front would
 * make this feel like a wizard.
 */
import { useCallback, useRef, useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { useMatters } from '../state/MattersContext';
import { useDismissable } from '../hooks/useDismissable';
import { t } from '../design/tokens';

interface Props {
  variant?: 'primary' | 'ghost';
  onCreated?: (matterId: string) => void;
}

export default function NewMatterButton({
  variant = 'ghost',
  onCreated,
}: Props) {
  const { createMatter } = useMatters();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const cancel = useCallback(() => {
    setOpen(false);
    setTitle('');
    setError(null);
  }, []);

  useDismissable(wrapRef, open, cancel);

  const submit = async () => {
    const clean = title.trim();
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    try {
      const detail = await createMatter({ title: clean });
      onCreated?.(detail.id);
      cancel();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not create matter');
    } finally {
      setBusy(false);
    }
  };

  const isPrimary = variant === 'primary';

  return (
    <div className="relative" ref={wrapRef}>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center cursor-pointer border-0"
          style={{
            gap: t.space.xs,
            padding: `${t.space.sm} ${t.space.md}`,
            fontSize: t.size.ui,
            fontWeight: t.weight.semibold,
            color: isPrimary ? t.color.bg : t.color.text,
            backgroundColor: isPrimary ? t.color.accent : t.color.hover,
            borderRadius: t.radius.md,
            transition: t.motion.fast,
          }}
        >
          <Plus size={14} />
          New matter
        </button>
      ) : (
        <div
          className="flex items-center"
          style={{
            gap: t.space.xs,
            padding: t.space.xs,
            backgroundColor: t.color.raised,
            border: `1px solid ${t.color.border}`,
            borderRadius: t.radius.md,
          }}
        >
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') void submit();
              if (e.key === 'Escape') cancel();
            }}
            placeholder="Sharma v. Sharma — divorce"
            disabled={busy}
            style={{
              border: 'none',
              outline: 'none',
              padding: `${t.space.xs} ${t.space.sm}`,
              fontSize: t.size.ui,
              backgroundColor: 'transparent',
              color: t.color.text,
              minWidth: '260px',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={() => void submit()}
            disabled={!title.trim() || busy}
            className="inline-flex items-center cursor-pointer border-0 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              gap: t.space.xs,
              padding: `${t.space.xs} ${t.space.sm}`,
              fontSize: t.size.ui,
              fontWeight: t.weight.semibold,
              color: t.color.bg,
              backgroundColor: t.color.accent,
              borderRadius: t.radius.sm,
              transition: t.motion.fast,
            }}
          >
            {busy && <Loader2 size={12} className="animate-spin" />}
            Create
          </button>
        </div>
      )}
      {error && (
        <p
          style={{
            position: 'absolute',
            top: '100%',
            marginTop: t.space.xs,
            fontSize: t.size.micro,
            color: t.color.danger,
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
