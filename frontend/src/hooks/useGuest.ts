/**
 * Guest-mode hook.
 *
 * Lets a user skip Clerk sign-in for the current browser tab. We persist the
 * flag in sessionStorage (not localStorage) so closing the tab ends the guest
 * session — the only "identity" a guest has.
 *
 * Backend is already tolerant: the X-User-Id header is optional, so omitting
 * it for guests Just Works™ — each guest just shares the anonymous bucket.
 */
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'miniharvey.guest';
const CHANGE_EVENT = 'miniharvey:guest-change';

function readFlag(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function useGuest() {
  const [isGuest, setIsGuest] = useState<boolean>(readFlag);

  // Cross-component sync — any setter fires a custom event that every mounted
  // hook listens for, so the header chip and the login gate stay in lock-step
  // without a full context provider.
  useEffect(() => {
    const onChange = () => setIsGuest(readFlag());
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  const enterGuest = useCallback(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* private-mode storage can throw; non-fatal */
    }
    setIsGuest(true);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const exitGuest = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setIsGuest(false);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { isGuest, enterGuest, exitGuest };
}
