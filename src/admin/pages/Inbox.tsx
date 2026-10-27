import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Bell, CheckCheck, Inbox as InboxIcon, Mail, MailOpen, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { supabase } from '@/lib/supabase';
import { formatDateTime, timeAgo } from '@/utils/format';
import type { AppNotification, ContactMessage } from '@/types/db';
import type { AdminOutletContext } from '../components/AdminLayout';
import { PageIntro } from '../components/ResourcePage';
import { useApiError, useTable } from '../data';

type R<T> = T & Record<string, unknown>;
const iconBtn = 'grid h-11 w-11 shrink-0 place-items-center rounded-md border border-line bg-card hover:bg-sunken';

export function Contacts() {
  const { rows, loading, error, reload, update, remove } = useTable<R<ContactMessage>>('contact_messages');
  const toast = useToast();
  const apiError = useApiError();
  const [deleting, setDeleting] = useState<ContactMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const toggleRead = async (m: ContactMessage) => {
    try { await update(m.id, { is_read: !m.is_read } as Partial<R<ContactMessage>>); }
    catch (err) { toast.error('Could not update message', apiError(err, 'Please try again.')); }
  };
  return (
    <div>
      <PageIntro text="Messages sent through the website contact form. New messages arrive here instantly."
        action={<Button variant="secondary" onClick={() => void reload()}>Refresh</Button>} />
      {loading ? <div className="space-y-3"><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /></div>
        : error ? <ErrorState message={error} onRetry={() => void reload()} />
        : rows.length ? (
          <ul className="grid gap-3 lg:grid-cols-2">
            {rows.map((m) => (
              <li key={m.id} className={`card p-4 ${m.is_read ? '' : 'border-accent/50'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">{m.name}{!m.is_read && <Badge tone="accent">New</Badge>}</p>
                    <p className="break-all text-[13px] text-muted"><a href={`mailto:${m.email}`} className="hover:underline">{m.email}</a>{m.phone && <> · <a href={`tel:${m.phone.replace(/[^\d+]/g, '')}`} className="hover:underline">{m.phone}</a></>}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button type="button" className={iconBtn} onClick={() => void toggleRead(m)} aria-label={m.is_read ? `Mark message from ${m.name} as unread` : `Mark message from ${m.name} as read`}>
                      {m.is_read ? <Mail className="h-4 w-4" aria-hidden /> : <MailOpen className="h-4 w-4" aria-hidden />}
                    </button>
                    <button type="button" className={`${iconBtn} text-danger`} onClick={() => { setDeleteError(null); setDeleting(m); }} aria-label={`Delete message from ${m.name}`}><Trash2 className="h-4 w-4" aria-hidden /></button>
                  </div>
                </div>
                {/* Rendered as plain text — customer input is never interpreted as HTML. */}
                <p className="mt-3 whitespace-pre-line break-words text-sm text-ink/85">{m.message}</p>
                <p className="mt-2 text-xs text-muted">{formatDateTime(m.created_at)}</p>
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={<InboxIcon className="h-6 w-6" aria-hidden />} title="No messages yet" body="Customer contacts will appear here." />}
      <ConfirmDialog open={deleting !== null} onCancel={() => setDeleting(null)} busy={busy} error={deleteError} title="Delete this message?" message="This action cannot be undone."
        onConfirm={async () => {
          if (!deleting) return;
          setBusy(true); setDeleteError(null);
          try { await remove(deleting.id); toast.success('Message deleted'); setDeleting(null); }
          catch (err) { setDeleteError(apiError(err, 'Could not delete. Check the connection and try again.')); }
          finally { setBusy(false); }
        }} />
    </div>
  );
}

export function Notifications() {
  const { rows, loading, error, reload, update, remove } = useTable<R<AppNotification>>('notifications');
  const { refreshUnread } = useOutletContext<AdminOutletContext>();
  const toast = useToast();
  const apiError = useApiError();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [bulk, setBulk] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const unread = rows.filter((n) => !n.is_read).length;
  const list = filter === 'unread' ? rows.filter((n) => !n.is_read) : rows;

  const markAll = async () => {
    setBulk(true);
    const { error: err } = await supabase.from('notifications').update({ is_read: true }).eq('is_read', false);
    setBulk(false);
    if (err) { toast.error('Could not mark as read', apiError(err, 'Please try again.')); return; }
    await Promise.all([reload(), refreshUnread()]);
  };
  const act = async (fn: () => Promise<void>) => {
    try { await fn(); await refreshUnread(); } catch (err) { toast.error('Could not update notification', apiError(err, 'Please try again.')); }
  };

  return (
    <div>
      <PageIntro text="Booking and contact activity, delivered in real time."
        action={<div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void markAll()} loading={bulk} disabled={!unread} icon={<CheckCheck className="h-4 w-4" aria-hidden />}>Mark all read</Button>
          <Button variant="secondary" onClick={() => { setClearError(null); setConfirmClear(true); }} disabled={!rows.length} icon={<Trash2 className="h-4 w-4" aria-hidden />}>Clear all</Button>
        </div>} />
      <div className="mb-4 flex gap-2" role="tablist" aria-label="Filter notifications">
        {(['all', 'unread'] as const).map((f) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
            className={`min-h-11 rounded-full border px-4 text-[13px] font-semibold capitalize ${filter === f ? 'border-accent bg-accent text-white' : 'border-line bg-card hover:bg-sunken'}`}>
            {f}{f === 'unread' ? ` (${unread})` : ` (${rows.length})`}
          </button>
        ))}
      </div>
      {loading ? <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
        : error ? <ErrorState message={error} onRetry={() => void reload()} />
        : list.length ? (
          <ul className="flex flex-col gap-3">
            {list.map((n) => (
              <li key={n.id} className={`card flex items-start gap-3 p-4 ${n.is_read ? '' : 'border-accent/50'}`}>
                <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${n.is_read ? 'bg-sunken text-muted' : 'bg-accent-soft text-accent-text'}`}><Bell className="h-4 w-4" aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${n.is_read ? '' : 'font-semibold'}`}>{n.title}{!n.is_read && <span className="sr-only"> (unread)</span>}</p>
                  <p className="text-[13px] text-muted">{n.body}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted">
                    {timeAgo(n.created_at)}
                    {(n.kind === 'booking' || n.kind === 'status' || n.kind === 'assignment') && <Link className="link" to={`/admin/bookings?q=${encodeURIComponent(n.title.split('· ')[1] ?? '')}`}>View Booking</Link>}
                    {n.kind === 'message' && <Link className="link" to="/admin/contacts">View Message</Link>}
                  </p>
                </div>
                {!n.is_read && <button type="button" className={iconBtn} aria-label={`Mark "${n.title}" as read`} onClick={() => void act(() => update(n.id, { is_read: true } as Partial<R<AppNotification>>))}><CheckCheck className="h-4 w-4" aria-hidden /></button>}
                <button type="button" className={iconBtn} aria-label={`Dismiss "${n.title}"`} onClick={() => void act(() => remove(n.id))}><X className="h-4 w-4" aria-hidden /></button>
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={<Bell className="h-6 w-6" aria-hidden />} title="All caught up" body={filter === 'unread' ? 'No unread notifications.' : 'New bookings and messages will show up here.'} />}
      <ConfirmDialog open={confirmClear} onCancel={() => setConfirmClear(false)} busy={bulk} error={clearError} title="Clear all notifications?" confirmLabel="Clear all"
        message="This removes every notification. Bookings and messages themselves are not affected."
        onConfirm={async () => {
          setBulk(true); setClearError(null);
          const { error: err } = await supabase.from('notifications').delete().not('id', 'is', null);
          setBulk(false);
          if (err) { setClearError(apiError(err, 'Could not clear notifications. Please try again.')); return; }
          setConfirmClear(false); toast.success('Notifications cleared');
          await Promise.all([reload(), refreshUnread()]);
        }} />
    </div>
  );
}
