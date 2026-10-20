// Local stand-in for Supabase Realtime "postgres_changes", for end-to-end tests only.
// Speaks the Phoenix v2 JSON protocol that @supabase/realtime-js uses (messages are [join_ref, ref, topic, event, payload]).
// Changes come from Postgres NOTIFY (e2e/realtime-emulator.sql). Before an INSERT/UPDATE reaches a subscriber the
// emulator re-reads the row through PostgREST WITH THAT SUBSCRIBER'S JWT, so row-level security decides delivery,
// as it does on Supabase. DELETE events carry only the primary key, as Supabase does for tables with RLS.
import { WebSocketServer } from 'ws';
import pg from 'pg';

export function attachRealtime(server, { postgrest, verify, dbUrl, log = () => {} }) {
  const wss = new WebSocketServer({ noServer: true });
  /** @type {Set<{ws: import('ws').WebSocket, topic: string, joinRef: string, token: string, bindings: {id:number, event:string, schema:string, table:string, filter?:string}[]}>} */
  const subs = new Set();
  let nextId = 1;

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/realtime/v1/websocket')) return socket.destroy();
    const apikey = url.searchParams.get('apikey') ?? '';
    if (!verify(apikey)) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); return socket.destroy(); }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.apikey = apikey;
      ws.on('message', (raw) => onMessage(ws, raw.toString()));
      ws.on('close', () => { for (const s of subs) if (s.ws === ws) subs.delete(s); });
    });
  });

  const send = (ws, joinRef, ref, topic, event, payload) => {
    if (ws.readyState === 1) ws.send(JSON.stringify([joinRef, ref, topic, event, payload]));
  };

  function onMessage(ws, text) {
    let msg; try { msg = JSON.parse(text); } catch { return; }
    const [joinRef, ref, topic, event, payload] = msg;
    if (topic === 'phoenix' && event === 'heartbeat') return send(ws, null, ref, 'phoenix', 'phx_reply', { status: 'ok', response: {} });
    if (event === 'phx_join') {
      const token = payload?.access_token ?? ws.apikey;
      if (!verify(token)) return send(ws, joinRef, ref, topic, 'phx_reply', { status: 'error', response: { reason: 'Invalid JWT' } });
      for (const s of subs) if (s.ws === ws && s.topic === topic) subs.delete(s);
      const bindings = (payload?.config?.postgres_changes ?? []).map((b) => ({ ...b, id: nextId++ }));
      subs.add({ ws, topic, joinRef, token, bindings });
      log(`join ${topic} (${bindings.map((b) => b.table + (b.filter ? `?${b.filter}` : '')).join(', ')})`);
      return send(ws, joinRef, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: bindings } });
    }
    if (event === 'access_token') {
      for (const s of subs) if (s.ws === ws && s.topic === topic && verify(payload?.access_token)) s.token = payload.access_token;
      return;
    }
    if (event === 'phx_leave') {
      for (const s of subs) if (s.ws === ws && s.topic === topic) subs.delete(s);
      return send(ws, joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} });
    }
    // broadcast / presence are not used by this app
    send(ws, joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} });
  }

  const matchesFilter = (filter, row) => {
    if (!filter) return true;
    const m = /^([^=]+)=eq\.(.*)$/.exec(filter);
    if (!m) return false;                                   // only eq filters are used by the app
    return row && String(row[m[1]]) === m[2];
  };

  /** Re-read the row as the subscriber: null when RLS hides it. */
  async function visibleRow(table, id, token) {
    const r = await fetch(`${postgrest}/${table}?id=eq.${encodeURIComponent(id)}&limit=1`, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows[0] ?? null;
  }

  async function deliver(change) {
    const { table, type, at } = change;
    const id = (change.record ?? change.old)?.id;
    for (const s of [...subs]) {
      const hits = s.bindings.filter((b) => (b.schema ?? 'public') === 'public' && b.table === table && (b.event === '*' || b.event === type));
      if (!hits.length) continue;
      let record = null; let old = null;
      if (type === 'DELETE') {
        old = { id };
      } else {
        if (id === undefined) continue;
        record = await visibleRow(table, id, s.token);
        if (!record) continue;                              // RLS: this subscriber may not see the row
        if (!change.partial && change.record) record = { ...record, ...change.record };
        if (type === 'UPDATE') old = { id };
      }
      const ids = hits.filter((b) => type === 'DELETE' || matchesFilter(b.filter, record)).map((b) => b.id);
      if (!ids.length) continue;
      send(s.ws, null, null, s.topic, 'postgres_changes', {
        ids,
        data: { schema: 'public', table, commit_timestamp: at, type, columns: [], record: record ?? {}, old_record: old ?? {}, errors: null },
      });
    }
  }

  // Serialise deliveries so subscribers see changes in commit order.
  let queue = Promise.resolve();
  const listener = new pg.Client({ connectionString: dbUrl });
  listener.on('notification', (n) => {
    let change; try { change = JSON.parse(n.payload); } catch { return; }
    queue = queue.then(() => deliver(change)).catch((e) => console.error('[realtime] deliver failed', e));
  });
  listener.on('error', (e) => console.error('[realtime] listener error', e.message));
  listener.connect().then(() => listener.query('listen ijt_realtime')).then(() => log('realtime listening'))
    .catch((e) => console.error('[realtime] could not listen:', e.message));
  return { close: () => { wss.close(); return listener.end(); } };
}
