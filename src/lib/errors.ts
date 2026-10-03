interface MaybeDbError { code?: string; message?: string; status?: number; name?: string; details?: string }

/** Raised by our own Postgres functions with a customer-safe message. */
const VALIDATION_CODE = 'P0001';

/**
 * Turns any thrown value into a message that is safe and useful to show a person.
 * The raw error is always logged for developers; it never contains secrets.
 */
export function friendlyError(err: unknown, fallback: string): string {
  const e = (err ?? {}) as MaybeDbError;
  console.error('[ijt]', fallback, err);

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'You appear to be offline. Check your connection and try again.';
  }
  if (e.name === 'TimeoutError' || e.name === 'AbortError' || /aborted|timed? ?out/i.test(e.message ?? '')) {
    return 'The request took too long. Please check your connection and try again.';
  }
  if (/failed to fetch|networkerror|load failed/i.test(e.message ?? '')) {
    return 'We could not reach the server. Please check your connection and try again.';
  }
  if (e.code === VALIDATION_CODE && e.message) return e.message;
  if (isSessionError(err)) return 'Your session has expired. Please sign in again.';
  if (e.code === '42501' || e.status === 403) return 'You do not have permission to do that.';
  if (e.code === '23505') return 'That already exists. Please use a different name.';
  if (e.code === '23514') return 'One of the values is not in an accepted format. Please check and try again.';
  return fallback;
}

export function isSessionError(err: unknown): boolean {
  const e = (err ?? {}) as MaybeDbError;
  return e.code === 'PGRST301' || e.status === 401 || /jwt expired|invalid jwt/i.test(e.message ?? '');
}
