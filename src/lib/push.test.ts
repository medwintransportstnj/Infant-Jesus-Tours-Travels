import { describe, expect, it } from 'vitest';
import https from 'node:https';
import type http from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';
import webpush from 'web-push';
import { dispatch, parsePayload, safeEqual, type StoredSubscription } from '../../supabase/functions/push-dispatch/dispatch';

const A = '00000000-0000-0000-0000-0000000000a1';
const B = '00000000-0000-0000-0000-0000000000b2';

describe('push dispatch', () => {
  it('validates and trims the payload', () => {
    expect(parsePayload(null)).toBeNull();
    expect(parsePayload({ recipients: [], title: 'x' })).toBeNull();
    expect(parsePayload({ recipients: [A], title: '' })).toBeNull();
    const p = parsePayload({ recipients: [A, A, 'not-a-uuid'], title: 'T', body: 'B', url: 'https://evil.example/' });
    expect(p).toEqual({ recipients: [A], title: 'T', body: 'B', url: '/', tag: undefined });
    expect(parsePayload({ recipients: [A], title: 'T', url: '//evil.example' })?.url).toBe('/');
    expect(parsePayload({ recipients: [A], title: 'T', url: '/admin/bookings?q=IJT-0001' })?.url).toBe('/admin/bookings?q=IJT-0001');
  });

  it('compares the shared secret safely', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(false);
  });

  it('sends to every device and removes devices the push service reports as gone', async () => {
    const subs: StoredSubscription[] = [
      { id: '1', endpoint: 'https://p/1', p256dh: 'k', auth: 'a' },
      { id: '2', endpoint: 'https://p/2', p256dh: 'k', auth: 'a' },
      { id: '3', endpoint: 'https://p/3', p256dh: 'k', auth: 'a' },
    ];
    const removed: string[] = [];
    const sent: string[] = [];
    const result = await dispatch({ recipients: [A, B], title: 'New Booking Request · IJT-0007', body: 'b', url: '/admin', tag: 't' }, {
      load: async (ids) => { expect(ids).toEqual([A, B]); return subs; },
      send: async (s, message) => { sent.push(message); if (s.id === '2') return 'gone'; if (s.id === '3') throw new Error('boom'); return 'sent'; },
      remove: async (ids) => { removed.push(...ids); },
    });
    expect(result).toEqual({ devices: 3, sent: 1, removed: 1, failed: 1 });
    expect(removed).toEqual(['2']);
    expect(JSON.parse(sent[0])).toEqual({ title: 'New Booking Request · IJT-0007', body: 'b', url: '/admin', tag: 't' });
  });

  it('produces a real encrypted Web Push request that a push service would accept', async () => {
    // A stand-in push service: records what web-push sends (same library the Edge Function uses).
    const received: { headers: http.IncomingHttpHeaders; bytes: number }[] = [];
    const dir = mkdtempSync(join(tmpdir(), 'push-'));
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-days', '1', '-subj', '/CN=127.0.0.1'], { stdio: 'ignore' });
    const server = https.createServer({ key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')) }, (req, res) => {
      let bytes = 0; req.on('data', (c: Buffer) => { bytes += c.length; });
      req.on('end', () => { received.push({ headers: req.headers, bytes }); res.writeHead(201); res.end(); });
    });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as { port: number }).port;
    const vapid = webpush.generateVAPIDKeys();
    webpush.setVapidDetails('mailto:test@example.com', vapid.publicKey, vapid.privateKey);
    const browserKeys = crypto.createECDH('prime256v1'); browserKeys.generateKeys();
    const sub = { endpoint: `https://127.0.0.1:${port}/push/abc`, keys: { p256dh: browserKeys.getPublicKey('base64url'), auth: crypto.randomBytes(16).toString('base64url') } };
    const res = await webpush.sendNotification(sub, JSON.stringify({ title: 'Hello', body: 'World', url: '/' }), { TTL: 60, urgency: 'high', agent: new https.Agent({ rejectUnauthorized: false }) });
    server.close();
    expect(res.statusCode).toBe(201);
    expect(received).toHaveLength(1);
    expect(received[0].headers['content-encoding']).toBe('aes128gcm');
    expect(received[0].headers.authorization).toMatch(/^vapid t=.+, k=.+/);
    expect(received[0].headers.urgency).toBe('high');
    expect(received[0].bytes).toBeGreaterThan(100);
  });
});
