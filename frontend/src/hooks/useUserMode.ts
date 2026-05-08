/**
 * useUserMode — current Vidhi user segment.
 *
 * Today every authenticated user defaults to 'associate' on the backend.
 * Until we ship a /me endpoint and a real UserModeContext, this hook
 * returns the static default. FeatureGate calls into here so the day we
 * have real per-user modes, swapping the implementation lights up gating
 * everywhere without touching call sites.
 */
import type { UserMode } from '../types';

export function useUserMode(): UserMode {
  return 'associate';
}
