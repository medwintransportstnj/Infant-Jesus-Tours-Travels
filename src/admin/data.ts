import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { supabase, timeoutSignal, type Bucket } from '@/lib/supabase';
import { friendlyError, isSessionError } from '@/lib/errors';
import { storageObjectName, type PreparedImage } from '@/utils/image';
import { useAuth } from './auth';

/** Subscribes to row changes on the given tables and calls `onChange` (debounced). No polling. */
export function useRealtime(tables: string[], onChange: (table: string, payload: { eventType: string; new: Record<string, unknown> }) => void, debounceMs = 300) {
  const id = useId();
  const cb = useRef(onChange); cb.current = onChange;
  const key = tables.join(',');
  useEffect(() => {
    const timers = new Map<string, number>();
    let channel = supabase.channel(`admin-${key}-${id}`);
    key.split(',').forEach((table) => {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
        window.clearTimeout(timers.get(table));
        const p = { eventType: payload.eventType, new: (payload.new ?? {}) as Record<string, unknown> };
        if (debounceMs === 0) { cb.current(table, p); return; }
        timers.set(table, window.setTimeout(() => cb.current(table, p), debounceMs));
      });
    });
    channel.subscribe();
    return () => { timers.forEach((t) => window.clearTimeout(t)); void supabase.removeChannel(channel); };
  }, [key, id, debounceMs]);
}

/** Maps an API error to a message and, if the session is gone, sends the admin back to sign-in. */
export function useApiError() {
  const { handleExpired } = useAuth();
  return useCallback((err: unknown, fallback: string): string => {
    if (isSessionError(err)) handleExpired();
    return friendlyError(err, fallback);
  }, [handleExpired]);
}

type Row = { id: string } & Record<string, unknown>;
interface TableOptions { orderBy?: string; ascending?: boolean; thenBy?: string; idColumn?: string }

/** Full contents of one (small) content table, kept live through Realtime, plus CRUD helpers that throw on failure. */
export function useTable<T extends Row>(table: string, { orderBy = 'created_at', ascending = false, thenBy, idColumn = 'id' }: TableOptions = {}) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const apiError = useApiError();

  const load = useCallback(async () => {
    let q = supabase.from(table).select('*').order(orderBy, { ascending });
    if (thenBy) q = q.order(thenBy, { ascending: true });
    const { data, error: err } = await q.abortSignal(timeoutSignal());
    if (err) { setError(apiError(err, 'Could not load this section. Check the connection and try again.')); }
    else { setRows((data ?? []) as unknown as T[]); setError(null); }
    setLoading(false);
  }, [table, orderBy, ascending, thenBy, apiError]);

  useEffect(() => { void load(); }, [load]);
  useRealtime([table], () => void load());

  const insert = useCallback(async (values: Partial<T>) => {
    const { error: err } = await supabase.from(table).insert(values as never);
    if (err) throw err;
    await load();
  }, [table, load]);
  const update = useCallback(async (id: string, values: Partial<T>) => {
    // .select() makes a silently-filtered (RLS) update visible as an error instead of a fake success.
    const { data, error: err } = await supabase.from(table).update(values as never).eq(idColumn, id).select(idColumn);
    if (err) throw err;
    if (!data?.length) throw Object.assign(new Error('No row was updated'), { code: '42501' });
    await load();
  }, [table, idColumn, load]);
  const remove = useCallback(async (id: string) => {
    const { data, error: err } = await supabase.from(table).delete().eq(idColumn, id).select(idColumn);
    if (err) throw err;
    if (!data?.length) throw Object.assign(new Error('No row was deleted'), { code: '42501' });
    await load();
  }, [table, idColumn, load]);

  return { rows, loading, error, reload: load, insert, update, remove };
}

// ---------- storage ----------
export interface ImageDraft { prepared: PreparedImage | null; removed: boolean }
export const NO_IMAGE_CHANGE: ImageDraft = { prepared: null, removed: false };

export async function removeObject(bucket: Bucket, path: string | null | undefined): Promise<void> {
  if (!path) return;
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) console.error('[ijt] could not remove old image (orphan left in storage)', bucket, path, error);
}

/**
 * Uploads the pending image (if any), runs the database write with the resulting path, and cleans up:
 * the old object after success, or the just-uploaded object if the write fails. Images are stored in
 * Supabase Storage; only the object path is saved in Postgres — never base64.
 */
export async function persistWithImage(opts: {
  bucket: Bucket; folder: string; draft: ImageDraft; currentPath: string | null;
  write: (imagePath: string | null) => Promise<void>;
}): Promise<void> {
  const { bucket, folder, draft, currentPath, write } = opts;
  let uploaded: string | null = null;
  if (draft.prepared) {
    const name = storageObjectName(folder, draft.prepared.extension);
    const { error } = await supabase.storage.from(bucket).upload(name, draft.prepared.blob, {
      contentType: draft.prepared.blob.type, cacheControl: '31536000', upsert: false,
    });
    if (error) throw Object.assign(new Error('upload failed'), { cause: error, isUpload: true, status: (error as { statusCode?: string }).statusCode === '403' ? 403 : undefined, message: error.message });
    uploaded = name;
  }
  const nextPath = uploaded ?? (draft.removed ? null : currentPath);
  try {
    await write(nextPath);
  } catch (err) {
    if (uploaded) await removeObject(bucket, uploaded);
    throw err;
  }
  if (currentPath && currentPath !== nextPath) await removeObject(bucket, currentPath);
}

export function uploadErrorMessage(err: unknown): string | null {
  return (err as { isUpload?: boolean })?.isUpload ? 'Image upload failed. Please check the file size and try again.' : null;
}
