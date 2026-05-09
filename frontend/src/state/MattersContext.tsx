/**
 * MattersContext — single source of truth for the user's matter list,
 * shared across every route that needs it (Today, MattersPage, the
 * MatterSelector inside MatterDetailPage).
 *
 * Each route used to fetch /matters independently; this dedupes that
 * and keeps the sidebar / breadcrumb / page in sync after a create.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import {
  createMatter as apiCreateMatter,
  deleteMatter as apiDeleteMatter,
  listMatters,
  patchMatter,
  type CreateMatterInput,
  type UpdateMatterInput,
} from '../services/api';
import type { MatterDetail, MatterSummary } from '../types';

interface Ctx {
  matters: MatterSummary[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Optimistically add (or replace) one matter in the list. */
  upsertSummary: (m: MatterSummary) => void;
  /** Create a matter on the server, refresh the list, return the detail. */
  createMatter: (input: CreateMatterInput) => Promise<MatterDetail>;
  /** PATCH a matter, optimistically apply the change, reconcile on response. */
  updateMatter: (id: string, fields: UpdateMatterInput) => Promise<MatterDetail>;
  /** Soft-delete a matter. Optimistically drops it from the list; refreshes
   *  on error so the rollback reflects server truth. */
  removeMatter: (id: string) => Promise<void>;
  inboxMatter: MatterSummary | null;
}

const MattersCtx = createContext<Ctx | null>(null);

function summaryFromDetail(detail: MatterDetail): MatterSummary {
  return {
    id: detail.id,
    title: detail.title,
    description: detail.description,
    court: detail.court,
    cause_number: detail.cause_number,
    status: detail.status,
    is_inbox: detail.is_inbox,
    parties: detail.parties,
    created_at: detail.created_at,
    updated_at: detail.updated_at,
    thread_count: detail.threads.length,
    document_count: detail.documents.length,
  };
}

export function MattersProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const { getToken } = useAuth();
  const getAuthToken = useCallback(() => getToken(), [getToken]);

  const [matters, setMatters] = useState<MatterSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listMatters(user?.id, getAuthToken);
      setMatters(list);
      setLoaded(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load matters');
    } finally {
      setLoading(false);
    }
  }, [user?.id, getAuthToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upsertSummary = useCallback((m: MatterSummary) => {
    setMatters(prev => {
      const idx = prev.findIndex(x => x.id === m.id);
      if (idx === -1) return [m, ...prev];
      const next = prev.slice();
      next[idx] = m;
      return next;
    });
  }, []);

  const createMatter = useCallback(
    async (input: CreateMatterInput) => {
      const detail = await apiCreateMatter(input, user?.id, getAuthToken);
      upsertSummary(summaryFromDetail(detail));
      return detail;
    },
    [user?.id, getAuthToken, upsertSummary],
  );

  const updateMatter = useCallback(
    async (id: string, fields: UpdateMatterInput) => {
      // Optimistic: project the new fields onto the local summary so the
      // sidebar / breadcrumb update before the request returns. If the
      // server-side response narrows or reshapes anything, the reconcile
      // step replaces the row with the server's truth.
      setMatters(prev => {
        const idx = prev.findIndex(x => x.id === id);
        if (idx === -1) return prev;
        const next = prev.slice();
        next[idx] = { ...prev[idx], ...projectSummaryPatch(fields) };
        return next;
      });
      try {
        const detail = await patchMatter(id, fields, user?.id, getAuthToken);
        upsertSummary(summaryFromDetail(detail));
        return detail;
      } catch (err) {
        // Roll back the optimistic apply by re-reading the server list.
        void refresh();
        throw err;
      }
    },
    [user?.id, getAuthToken, upsertSummary, refresh],
  );

  const removeMatter = useCallback(
    async (id: string) => {
      const previous = matters;
      setMatters(prev => prev.filter(m => m.id !== id));
      try {
        await apiDeleteMatter(id, user?.id, getAuthToken);
      } catch (err) {
        // Roll back via fresh server read — fast, simple, and the user is
        // about to see an error toast anyway.
        setMatters(previous);
        void refresh();
        throw err;
      }
    },
    [matters, user?.id, getAuthToken, refresh],
  );

  const inboxMatter = useMemo(
    () => matters.find(m => m.is_inbox) ?? null,
    [matters],
  );

  const value: Ctx = {
    matters,
    loaded,
    loading,
    error,
    refresh,
    upsertSummary,
    createMatter,
    updateMatter,
    removeMatter,
    inboxMatter,
  };

  return <MattersCtx.Provider value={value}>{children}</MattersCtx.Provider>;
}

/** Project the subset of an UpdateMatterInput that matches MatterSummary
 *  fields, so the optimistic apply doesn't introduce keys the summary
 *  shape doesn't have (e.g. `parties` is shared). */
function projectSummaryPatch(fields: UpdateMatterInput): Partial<MatterSummary> {
  const out: Partial<MatterSummary> = {};
  if (fields.title !== undefined) out.title = fields.title;
  if (fields.description !== undefined) out.description = fields.description ?? null;
  if (fields.court !== undefined) out.court = fields.court ?? null;
  if (fields.cause_number !== undefined) out.cause_number = fields.cause_number ?? null;
  if (fields.parties !== undefined) out.parties = fields.parties ?? [];
  if (fields.status !== undefined) out.status = fields.status;
  return out;
}

export function useMatters(): Ctx {
  const ctx = useContext(MattersCtx);
  if (ctx === null) {
    throw new Error('useMatters must be used inside <MattersProvider>');
  }
  return ctx;
}
