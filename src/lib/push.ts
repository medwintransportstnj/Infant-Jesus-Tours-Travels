import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

// Phone/desktop notifications that arrive even when the site is closed (Web Push).
// The browser holds the subscription; Supabase stores which person it belongs to (push_subscribe RPC);
// the push-dispatch Edge Function sends to it. The VAPID public key is public by design.

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? '';

export type PushState =
  | 'checking'
  | 'unsupported'      // this browser cannot receive web push
  | 'ios-install'      // iPhone/iPad: works only after "Add to Home Screen"
  | 'not-configured'   // the site has no VAPID key yet (setup step)
  | 'blocked'          // the person blocked notifications for this site
  | 'off'
  | 'on';

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function basicSupport(): PushState | null {
  if (typeof window === 'undefined') return 'unsupported';
  const capable = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!capable) return isIos() && !isStandalone() ? 'ios-install' : 'unsupported';
  if (!VAPID_PUBLIC_KEY) return 'not-configured';
  if (Notification.permission === 'denied') return 'blocked';
  return null;
}

function keyBytes(base64url: string): Uint8Array {
  const padded = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

let registration: Promise<ServiceWorkerRegistration> | null = null;
export function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!registration) {
    registration = navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(() => navigator.serviceWorker.ready);
    registration.catch(() => { registration = null; });
  }
  return registration;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (!existing) return null;
  return existing.pushManager.getSubscription();
}

/** Removes this device for the signed-in person. Call BEFORE signing out (it needs the session). */
export async function forgetThisDevice(client: SupabaseClient): Promise<void> {
  try {
    const sub = await currentSubscription();
    if (sub) await client.rpc('push_unsubscribe', { p_endpoint: sub.endpoint });
  } catch (err) {
    console.warn('[ijt] could not remove this device from notifications', err);
  }
}

/**
 * Push on/off for the person signed in on `client`.
 * `userId` changes when someone signs in or out, which re-checks the state.
 */
export function usePushNotifications(client: SupabaseClient, userId: string | null) {
  const [state, setState] = useState<PushState>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const basic = basicSupport();
    if (basic) { setState(basic); return; }
    if (!userId) { setState('off'); return; }
    try {
      const sub = await currentSubscription();
      if (!sub || Notification.permission !== 'granted') { setState('off'); return; }
      const { data } = await client.rpc('push_is_subscribed', { p_endpoint: sub.endpoint });
      setState(data ? 'on' : 'off');
    } catch { setState('off'); }
  }, [client, userId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const enable = useCallback(async () => {
    if (!userId) return;
    setBusy(true); setError(null);
    try {
      // Must run inside the click: browsers only show the permission prompt for a user gesture.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setState(permission === 'denied' ? 'blocked' : 'off'); return; }
      const reg = await registerServiceWorker();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) as BufferSource });
      const json = sub.toJSON();
      const { error: err } = await client.rpc('push_subscribe', {
        p_endpoint: sub.endpoint, p_p256dh: json.keys?.p256dh ?? '', p_auth: json.keys?.auth ?? '', p_user_agent: navigator.userAgent.slice(0, 300),
      });
      if (err) throw err;
      setState('on');
    } catch (err) {
      console.error('[ijt] could not turn on notifications', err);
      setError('Notifications could not be turned on. Please try again.');
    } finally { setBusy(false); }
  }, [client, userId]);

  const disable = useCallback(async () => {
    setBusy(true); setError(null);
    await forgetThisDevice(client);
    setBusy(false);
    setState('off');
  }, [client]);

  return { state, busy, error, enable, disable };
}
