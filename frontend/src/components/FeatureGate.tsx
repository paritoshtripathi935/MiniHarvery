/**
 * FeatureGate — single chokepoint for hiding UI based on user mode.
 *
 * Today every signed-in user is `mode='associate'` and every gate passes.
 * When solo / student tiers ship (with paywalls), this component is the
 * one place we touch to hide or substitute UI per segment.
 *
 * Usage:
 *   <FeatureGate mode="associate">           // render only for associates
 *   <FeatureGate mode={['solo','student']}>  // render for either
 *   <FeatureGate flag="drafting_workshop">   // future: feature flags
 *
 * Rendering precedence:
 *   1. If `mode` is set and the user's mode isn't in it → render `fallback`.
 *   2. Otherwise render `children`.
 */
import type { ReactNode } from 'react';
import type { UserMode } from '../types';
import { useUserMode } from '../hooks/useUserMode';

interface Props {
  mode?: UserMode | UserMode[];
  fallback?: ReactNode;
  children: ReactNode;
}

export default function FeatureGate({ mode, fallback = null, children }: Props) {
  const userMode = useUserMode();
  if (mode !== undefined) {
    const allowed = Array.isArray(mode) ? mode : [mode];
    if (!allowed.includes(userMode)) return <>{fallback}</>;
  }
  return <>{children}</>;
}
