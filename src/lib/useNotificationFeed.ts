import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useToast } from '@/components/ui/Toast';
import { chime } from './chime';
import { subscribeLive } from './live';
import { timeoutSignal } from './supabase';

// The notification feed used by every role: office staff (notifications), drivers (driver_notifications)
// and customers (customer_notifications). Row-level security decides whose rows arrive; this hook only
// keeps the list, the unread count, the popup and the chime in step.

export interface FeedItem {
  id: string; title: string; body: string; is_read: boolean; created_at: string;
  actor_id: string | null; kind: string; booking_id?: string | null;
}

interface Options<T extends FeedItem> {
  client: SupabaseClient;
  table: 'notifications' | 'driver_notifications' | 'customer_notifications';
  /** Column holding the recipient (omit for the shared office inbox). */
  ownerColumn?: 'driver_id' | 'customer_id';
  userId: string | null;
  /** Where the popup's "View" link goes. */
  linkFor: (item: T) => string | undefined;
  limit?: number;
}

export function useNotificationFeed<T extends FeedItem>({ client, table, ownerColumn, userId, linkFor, limit = 30 }: Options<T>) {
  const toast = useToast();
  const [items, setItems] = useState<T[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const seen = useRef(new Set<string>());
  const linkRef = useRef(linkFor); linkRef.current = linkFor;

  const load = useCallback(async () => {
    if (!userId) return;
    let list = client.from(table).select('*').order('created_at', { ascending: false }).limit(limit);
    let count = client.from(table).select('id', { count: 'exact', head: true }).eq('is_read', false);
    if (ownerColumn) { list = list.eq(ownerColumn, userId); count = count.eq(ownerColumn, userId); }
    const [l, c] = await Promise.all([list.abortSignal(timeoutSignal()), count.abortSignal(timeoutSignal())]);
    if (l.error) console.error(`[ijt] ${table} load failed`, l.error);
    else { const rows = (l.data ?? []) as T[]; rows.forEach((r) => seen.current.add(r.id)); setItems(rows); }
    if (!c.error) setUnread(c.count ?? 0);
    setLoading(false);
  }, [client, table, ownerColumn, userId, limit]);

  useEffect(() => {
    seen.current.clear(); setItems([]); setUnread(0);
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    void load();
    return subscribeLive(client, table, [{ table, filter: ownerColumn ? `${ownerColumn}=eq.${userId}` : undefined }], (e) => {
      const row = e.new as unknown as T;
      if (e.eventType === 'INSERT' && row?.id) {
        if (seen.current.has(row.id)) return;            // exactly one popup per notification
        seen.current.add(row.id);
        setItems((list) => [row, ...list].slice(0, limit));
        if (!row.is_read) setUnread((n) => n + 1);
        // Someone else's action: popup + chime. Your own action: the list updates quietly
        // (you already saw the confirmation for what you just did).
        if (row.actor_id !== userId) {
          chime();
          toast.notify(row.title, row.body, { href: linkRef.current(row), linkLabel: 'View' });
        }
      } else if (e.eventType === 'UPDATE' && row?.id) {
        setItems((list) => list.map((x) => (x.id === row.id ? row : x)));
        void load();
      } else if (e.eventType === 'DELETE') {
        const id = (e.old as { id?: string }).id;
        if (id) setItems((list) => list.filter((x) => x.id !== id));
        void load();
      }
    }, () => void load());
  }, [client, table, ownerColumn, userId, limit, load, toast]);

  const markRead = useCallback(async (id: string) => {
    setItems((list) => list.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    setUnread((n) => Math.max(0, n - 1));
    const { error } = await client.from(table).update({ is_read: true }).eq('id', id);
    if (error) { console.error('[ijt] mark read failed', error); void load(); }
  }, [client, table, load]);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    setItems((list) => list.map((n) => ({ ...n, is_read: true })));
    setUnread(0);
    let q = client.from(table).update({ is_read: true }).eq('is_read', false);
    if (ownerColumn) q = q.eq(ownerColumn, userId);
    const { error } = await q;
    if (error) { console.error('[ijt] mark all read failed', error); void load(); }
  }, [client, table, ownerColumn, userId, load]);

  return { items, unread, loading, markRead, markAllRead, reload: load };
}
