import { useCallback, useEffect, useRef } from 'react';

/**
 * Debounce a save call, with an unmount-flush so pending edits aren't lost
 * if the component goes away. Returns a `queue(value)` function — call it
 * on every change; the latest value is persisted `delay` ms after the last
 * call. The actual `onSave` fires once per quiet period.
 *
 * `onSave` is read from a ref so a stale closure won't fire stale data.
 */
export function useDebouncedSave<T>(
  onSave: (value: T) => Promise<void>,
  delay = 600,
): (value: T) => void {
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<T | null>(null);
  const hasPending = useRef(false);

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (hasPending.current) {
      const value = pending.current as T;
      hasPending.current = false;
      pending.current = null;
      onSaveRef.current(value).catch(() => {
        // Caller is responsible for surfacing save errors via state — this
        // hook only guarantees the call fires.
      });
    }
  }, []);

  useEffect(() => {
    return () => {
      flush();
    };
  }, [flush]);

  return useCallback(
    (value: T) => {
      pending.current = value;
      hasPending.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        flush();
      }, delay);
    },
    [delay, flush],
  );
}
