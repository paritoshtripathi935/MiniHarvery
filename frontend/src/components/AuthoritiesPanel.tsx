/**
 * AuthoritiesPanel — the matter's pinned cases, edited inline, ready
 * to export as a Table of Authorities (Markdown or Print/PDF).
 *
 * Two top-of-panel actions: Add manually, Export as ToA. Rows render
 * AuthorityRow with optimistic updates: parent owns the list, the
 * row receives a value + onUpdate/onUnpin closures. Errors revert
 * the row to its previous state and surface as a banner.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useUser } from '@clerk/clerk-react';
import { Bookmark, Download, Plus, Printer } from 'lucide-react';
import AddAuthorityDialog from './AddAuthorityDialog';
import AuthorityRow from './AuthorityRow';
import { t } from '../design/tokens';
import type { Authority } from '../types';
import {
  listAuthorities,
  pinAuthority,
  unpinAuthority,
  updateAuthority,
  type PinAuthorityInput,
  type UpdateAuthorityInput,
} from '../services/api';
import { authoritiesToMarkdown } from '../utils/exportAuthorities';
import { downloadMarkdown, slugify } from '../utils/exportDocument';

interface Props {
  matterId: string;
  matterTitle: string;
}

export default function AuthoritiesPanel({ matterId, matterTitle }: Props) {
  const { user } = useUser();
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const getAuthToken = useCallback(() => getToken(), [getToken]);

  const [authorities, setAuthorities] = useState<Authority[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const rows = await listAuthorities(matterId, user?.id, getAuthToken);
        if (!cancelled) setAuthorities(rows);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load authorities');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [matterId, user?.id, getAuthToken]);

  const handleUpdate = useCallback(
    async (id: string, fields: UpdateAuthorityInput) => {
      const previous = authorities;
      setAuthorities(prev =>
        prev.map(a => (a.id === id ? { ...a, ...fields } as Authority : a)),
      );
      try {
        const updated = await updateAuthority(id, fields, user?.id, getAuthToken);
        setAuthorities(prev => prev.map(a => (a.id === id ? updated : a)));
      } catch (err) {
        setAuthorities(previous);
        setError(err instanceof Error ? err.message : 'Failed to update authority');
      }
    },
    [authorities, user?.id, getAuthToken],
  );

  const handleUnpin = useCallback(
    async (id: string) => {
      const previous = authorities;
      setAuthorities(prev => prev.filter(a => a.id !== id));
      try {
        await unpinAuthority(id, user?.id, getAuthToken);
      } catch (err) {
        setAuthorities(previous);
        setError(err instanceof Error ? err.message : 'Failed to unpin');
      }
    },
    [authorities, user?.id, getAuthToken],
  );

  const handleAdd = useCallback(
    async (input: PinAuthorityInput) => {
      const { authority, created } = await pinAuthority(
        matterId,
        input,
        user?.id,
        getAuthToken,
      );
      if (created) {
        setAuthorities(prev => [...prev, authority]);
      } else {
        // Pinning a case the matter already has — surface the existing row
        // so the user can edit it rather than thinking the pin silently
        // failed.
        setAuthorities(prev =>
          prev.map(a => (a.id === authority.id ? authority : a)),
        );
        setError(`"${authority.case_name}" was already pinned to this matter.`);
      }
    },
    [matterId, user?.id, getAuthToken],
  );

  const handleDownload = () => {
    const md = authoritiesToMarkdown(authorities, matterTitle);
    downloadMarkdown(`toa-${slugify(matterTitle)}`, md);
  };

  const handlePrint = () => {
    const md = authoritiesToMarkdown(authorities, matterTitle);
    navigate('/print', {
      state: { title: `Table of Authorities — ${matterTitle}`, markdown: md },
    });
  };

  const canExport = authorities.length > 0;

  return (
    <main
      className="flex-1 overflow-y-auto"
      style={{
        backgroundColor: t.color.bg,
        padding: `${t.space.lg} ${t.space.xl}`,
      }}
    >
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <header
          className="flex items-end justify-between"
          style={{ gap: t.space.md, marginBottom: t.space.lg }}
        >
          <div>
            <h2
              className="serif m-0"
              style={{
                fontSize: t.size.h2,
                fontWeight: t.weight.semibold,
                color: t.color.text,
              }}
            >
              Authorities
            </h2>
            <p
              className="m-0"
              style={{
                fontSize: t.size.body,
                color: t.color.muted,
                marginTop: t.space.xs,
              }}
            >
              {authorities.length === 0
                ? 'Cases pinned for the Table of Authorities will appear here.'
                : `${authorities.length} ${authorities.length === 1 ? 'case' : 'cases'} pinned to this matter.`}
            </p>
          </div>
          <div className="flex items-center" style={{ gap: t.space.sm }}>
            {canExport && (
              <>
                <button
                  onClick={handleDownload}
                  className="inline-flex items-center cursor-pointer"
                  style={secondaryButton}
                  title="Download as Markdown"
                >
                  <Download size={13} /> MD
                </button>
                <button
                  onClick={handlePrint}
                  className="inline-flex items-center cursor-pointer"
                  style={secondaryButton}
                  title="Print or save as PDF"
                >
                  <Printer size={13} /> Print
                </button>
              </>
            )}
            <button
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center cursor-pointer border-0"
              style={primaryButton}
            >
              <Plus size={13} />
              Add authority
            </button>
          </div>
        </header>

        {error && (
          <div
            style={{
              padding: t.space.sm,
              marginBottom: t.space.md,
              borderRadius: t.radius.sm,
              backgroundColor: t.color.surface,
              border: `1px solid ${t.color.border}`,
              fontSize: t.size.ui,
              color: t.color.danger,
            }}
          >
            {error}
            <button
              onClick={() => setError(null)}
              className="cursor-pointer border-0 bg-transparent"
              style={{
                marginLeft: t.space.sm,
                color: t.color.muted,
                fontSize: t.size.micro,
              }}
            >
              Dismiss
            </button>
          </div>
        )}

        {loading ? (
          <p
            className="m-0"
            style={{
              fontSize: t.size.ui,
              color: t.color.dim,
              padding: `${t.space.lg} 0`,
              textAlign: 'center',
            }}
          >
            Loading authorities…
          </p>
        ) : authorities.length === 0 ? (
          <div
            style={{
              padding: `${t.space.xl} ${t.space.lg}`,
              border: `1px dashed ${t.color.border}`,
              borderRadius: t.radius.md,
              textAlign: 'center',
            }}
          >
            <Bookmark
              size={28}
              style={{ color: t.color.accentSoft, margin: '0 auto' }}
            />
            <p
              className="m-0"
              style={{
                fontSize: t.size.body,
                color: t.color.muted,
                maxWidth: '52ch',
                margin: '0 auto',
                marginTop: t.space.md,
                lineHeight: 1.6,
              }}
            >
              Pin cases from research or briefs to build a Table of Authorities
              for this matter. Briefs auto-pin their subject case; you can
              also add cases manually.
            </p>
            <button
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center cursor-pointer border-0"
              style={{ ...primaryButton, marginTop: t.space.lg }}
            >
              <Plus size={13} />
              Add authority
            </button>
          </div>
        ) : (
          <div>
            {authorities.map(a => (
              <AuthorityRow
                key={a.id}
                authority={a}
                onUpdate={handleUpdate}
                onUnpin={handleUnpin}
              />
            ))}
          </div>
        )}
      </div>

      <AddAuthorityDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={handleAdd}
      />
    </main>
  );
}

const primaryButton: React.CSSProperties = {
  gap: t.space.xs,
  padding: `${t.space.sm} ${t.space.md}`,
  fontSize: t.size.ui,
  fontWeight: t.weight.semibold,
  color: t.color.bg,
  backgroundColor: t.color.accent,
  borderRadius: t.radius.md,
  transition: t.motion.fast,
};

const secondaryButton: React.CSSProperties = {
  gap: t.space.xs,
  padding: `${t.space.sm} ${t.space.md}`,
  fontSize: t.size.ui,
  fontWeight: t.weight.medium,
  color: t.color.muted,
  backgroundColor: 'transparent',
  border: `1px solid ${t.color.border}`,
  borderRadius: t.radius.md,
  transition: t.motion.fast,
};
