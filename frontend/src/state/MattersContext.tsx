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
  listMatters,
  type CreateMatterInput,
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
  inboxMatter: MatterSummary | null;
}

const MattersCtx = createContext<Ctx | null>(null);

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
      upsertSummary({
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
      });
      return detail;
    },
    [user?.id, getAuthToken, upsertSummary],
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
    inboxMatter,
  };

  return <MattersCtx.Provider value={value}>{children}</MattersCtx.Provider>;
}

export function useMatters(): Ctx {
  const ctx = useContext(MattersCtx);
  if (ctx === null) {
    throw new Error('useMatters must be used inside <MattersProvider>');
  }
  return ctx;
}
