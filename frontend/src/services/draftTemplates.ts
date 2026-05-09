/**
 * Lazy module-level cache for draft templates. The list is small (~4
 * entries), stable across a session, and read-mostly — a context here
 * would be over-engineering. First call fetches; subsequent calls share
 * the same in-flight or resolved promise.
 *
 * If the request fails, the cache is cleared so the next caller retries
 * (rather than seeing a stuck rejection forever).
 */
import type { DraftTemplate } from '../types';
import { listDraftTemplates, type GetToken } from './api';

let cache: Promise<DraftTemplate[]> | null = null;

export function loadDraftTemplates(
  userId: string | undefined,
  getToken: GetToken,
): Promise<DraftTemplate[]> {
  if (cache) return cache;
  cache = listDraftTemplates(userId, getToken).catch(err => {
    cache = null;
    throw err;
  });
  return cache;
}

/** Test-only / sign-out hook. */
export function clearDraftTemplateCache(): void {
  cache = null;
}
