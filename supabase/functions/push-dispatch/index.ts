// Supabase Edge Function: delivers a saved notification to the recipients' phones and computers.
// Called only by the database (queue_push trigger) with a shared secret — not by browsers.
//
// Deploy:   supabase functions deploy push-dispatch --no-verify-jwt
// Secrets:  supabase secrets set PUSH_DISPATCH_SECRET=... VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to Edge Functions automatically.)
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { dispatch, parsePayload, safeEqual, type StoredSubscription } from './dispatch.ts';

const env = (name: string) => Deno.env.get(name) ?? '';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!safeEqual(req.headers.get('x-push-secret') ?? '', env('PUSH_DISPATCH_SECRET'))) {
    return new Response('Unauthorized', { status: 401 });
  }
  const payload = parsePayload(await req.json().catch(() => null));
  if (!payload) return new Response('Bad request', { status: 400 });
  if (!env('VAPID_PUBLIC_KEY') || !env('VAPID_PRIVATE_KEY')) {
    return new Response('Push is not configured: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.', { status: 503 });
  }

  webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:admin@example.com', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

  const result = await dispatch(payload, {
    async load(userIds) {
      const { data, error } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').in('user_id', userIds);
      if (error) throw error;
      return (data ?? []) as StoredSubscription[];
    },
    async send(sub, message) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, message, { TTL: 6 * 3600, urgency: 'high' });
        return 'sent';
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) return 'gone';   // the browser unsubscribed or the app was removed
        console.error('push failed', status, (err as Error).message);
        return 'failed';
      }
    },
    async remove(ids) {
      const { error } = await db.from('push_subscriptions').delete().in('id', ids);
      if (error) console.error('could not remove stale devices', error.message);
    },
  });
  return Response.json(result);
});
