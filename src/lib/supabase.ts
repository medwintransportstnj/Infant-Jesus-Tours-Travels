import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** False when the deployment is missing its environment variables. The app shows a setup screen instead of failing silently. */
export const isSupabaseConfigured = Boolean(url && anonKey && /^https?:\/\//.test(url));

const realtime = { params: { eventsPerSecond: 5 } };
const fallbackUrl = 'https://not-configured.invalid';

// Only the anon (public) key is ever used in the browser. Row Level Security is the security boundary.

/**
 * ADMIN client — used only by src/admin. Its session lives under its own storage key, so signing in to
 * the dashboard never signs anyone in on the public site, and vice versa. It ignores auth links in the
 * URL (password-reset / confirmation links belong to customers).
 */
export const supabase = createClient(url || fallbackUrl, anonKey || 'not-configured', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'ijt-admin-auth' },
  realtime,
});

/**
 * SITE client — public content, bookings and the CUSTOMER session. Anonymous until a customer signs in;
 * then create_booking() and the account pages run as that customer (auth.uid()).
 */
export const siteClient = createClient(url || fallbackUrl, anonKey || 'not-configured', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'ijt-customer-auth' },
  realtime,
});

export type Bucket = 'vehicle-images' | 'gallery-images' | 'website-assets' | 'logos';

export function publicImageUrl(bucket: Bucket, path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** A fresh abort signal so no request can hang forever on a bad connection. */
export function timeoutSignal(ms = 15000): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), ms);
  return controller.signal;
}
