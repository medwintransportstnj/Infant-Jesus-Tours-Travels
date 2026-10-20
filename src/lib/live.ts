import { useSyncExternalStore } from 'react';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

// One place that opens Supabase Realtime channels for the whole app (staff, drivers and customers).
//  - authenticates the socket with the signed-in session BEFORE joining, so row-level security lets the
//    rows through (a channel joined as an anonymous visitor silently receives nothing for private tables);
//  - reports connection state, so the UI can show "Live" or "Reconnecting…" instead of failing silently;
//  - asks the page to catch up whenever the channel (re)connects, the device comes back online or the tab
//    becomes visible again, so nothing that happened during a gap is missed. This is not polling.

export type LiveState = 'idle' | 'connecting' | 'live' | 'offline';

const channelStates = new Map<string, Exclude<LiveState, 'idle'>>();
const listeners = new Set<() => void>();
let snapshot: LiveState = 'idle';

function recompute() {
  const values = [...channelStates.values()];
  const next: LiveState = !values.length ? 'idle'
    : values.includes('offline') ? 'offline'
    : values.includes('connecting') ? 'connecting'
    : 'live';
  if (next !== snapshot) { snapshot = next; listeners.forEach((l) => l()); }
}
function setState(name: string, state: Exclude<LiveState, 'idle'> | null) {
  if (state) channelStates.set(name, state); else channelStates.delete(name);
  recompute();
}

/** Combined state of every live channel currently open in this tab. */
export function useLiveState(): LiveState {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => snapshot,
    () => 'idle',
  );
}

export interface LiveTable { table: string; filter?: string }
export interface LiveEvent { table: string; eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: Record<string, unknown>; old: Record<string, unknown> }

let counter = 0;

/** Opens one channel for the given tables. Returns a function that closes it. */
export function subscribeLive(
  client: SupabaseClient,
  label: string,
  tables: LiveTable[],
  onEvent: (event: LiveEvent) => void,
  onResync: () => void,
): () => void {
  const name = `${label}-${++counter}`;
  let channel: RealtimeChannel | null = null;
  let closed = false;
  setState(name, 'connecting');

  void (async () => {
    try {
      const { data } = await client.auth.getSession();
      if (closed) return;
      if (data.session) await client.realtime.setAuth(data.session.access_token);
    } catch (err) {
      console.warn('[ijt] live: could not read the session before joining', err);
    }
    if (closed) return;
    let ch = client.channel(name);
    for (const t of tables) {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: t.table, ...(t.filter ? { filter: t.filter } : {}) }, (payload) => {
        onEvent({
          table: t.table,
          eventType: payload.eventType as LiveEvent['eventType'],
          new: (payload.new ?? {}) as Record<string, unknown>,
          old: (payload.old ?? {}) as Record<string, unknown>,
        });
      });
    }
    channel = ch.subscribe((status, err) => {
      if (closed) return;
      if (status === 'SUBSCRIBED') { setState(name, 'live'); onResync(); }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setState(name, 'offline');
        // Most common causes: the table is not in the supabase_realtime publication, or Realtime is set
        // to "private channels only" in the Supabase dashboard. See README → Live updates.
        console.warn(`[ijt] live updates unavailable for ${tables.map((t) => t.table).join(', ')} (${status})`, err ?? '');
      } else if (status === 'CLOSED') setState(name, 'connecting');
    });
  })();

  const catchUp = () => { if (document.visibilityState === 'visible') onResync(); };
  window.addEventListener('online', onResync);
  document.addEventListener('visibilitychange', catchUp);

  return () => {
    closed = true;
    setState(name, null);
    window.removeEventListener('online', onResync);
    document.removeEventListener('visibilitychange', catchUp);
    if (channel) void client.removeChannel(channel);
  };
}
