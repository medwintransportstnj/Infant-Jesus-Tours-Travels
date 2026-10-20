// Delivery logic for the push-dispatch Edge Function, free of Deno/Node specifics so it can be unit-tested.
// The database decides WHO receives a notification (see queue_push() in the migrations); this only looks
// up those people's devices, sends, and cleans up devices the push service says are gone.

export interface PushPayload { recipients: string[]; title: string; body: string; url: string; tag?: string }
export interface StoredSubscription { id: string; endpoint: string; p256dh: string; auth: string }
export type SendOutcome = 'sent' | 'gone' | 'failed';
export interface DispatchDeps {
  load: (userIds: string[]) => Promise<StoredSubscription[]>;
  send: (subscription: StoredSubscription, message: string) => Promise<SendOutcome>;
  remove: (subscriptionIds: string[]) => Promise<void>;
}
export interface DispatchResult { devices: number; sent: number; removed: number; failed: number }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates the request body. Anything unexpected is rejected rather than forwarded to devices. */
export function parsePayload(input: unknown): PushPayload | null {
  if (!input || typeof input !== 'object') return null;
  const v = input as Record<string, unknown>;
  if (!Array.isArray(v.recipients) || v.recipients.length === 0 || v.recipients.length > 500) return null;
  const recipients = [...new Set(v.recipients.filter((r): r is string => typeof r === 'string' && UUID.test(r)))];
  if (recipients.length !== v.recipients.length && recipients.length === 0) return null;
  if (typeof v.title !== 'string' || !v.title.trim()) return null;
  const url = typeof v.url === 'string' && v.url.startsWith('/') && !v.url.startsWith('//') ? v.url : '/';
  return {
    recipients,
    title: v.title.slice(0, 120),
    body: typeof v.body === 'string' ? v.body.slice(0, 300) : '',
    url: url.slice(0, 300),
    tag: typeof v.tag === 'string' ? v.tag.slice(0, 120) : undefined,
  };
}

/** Constant-time comparison for the shared secret. */
export function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function dispatch(payload: PushPayload, deps: DispatchDeps): Promise<DispatchResult> {
  const subs = await deps.load(payload.recipients);
  const message = JSON.stringify({ title: payload.title, body: payload.body, url: payload.url, tag: payload.tag });
  const outcomes = await Promise.all(subs.map(async (s) => {
    try { return { id: s.id, outcome: await deps.send(s, message) }; }
    catch { return { id: s.id, outcome: 'failed' as const }; }
  }));
  const gone = outcomes.filter((o) => o.outcome === 'gone').map((o) => o.id);
  if (gone.length) await deps.remove(gone);
  return {
    devices: subs.length,
    sent: outcomes.filter((o) => o.outcome === 'sent').length,
    removed: gone.length,
    failed: outcomes.filter((o) => o.outcome === 'failed').length,
  };
}
