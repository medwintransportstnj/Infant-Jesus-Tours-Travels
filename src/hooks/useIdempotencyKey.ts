import { useCallback, useRef } from 'react';

/**
 * Returns the same key for identical payloads and a new key when the payload changes.
 * A retry after a timeout therefore returns the original booking instead of creating a duplicate,
 * while an edited form is treated as a new request.
 */
export function useIdempotencyKey() {
  const ref = useRef<{ key: string; snapshot: string } | null>(null);
  const keyFor = useCallback((payload: unknown): string => {
    const snapshot = JSON.stringify(payload);
    if (!ref.current || ref.current.snapshot !== snapshot) ref.current = { key: crypto.randomUUID(), snapshot };
    return ref.current.key;
  }, []);
  const reset = useCallback(() => { ref.current = null; }, []);
  return { keyFor, reset };
}
