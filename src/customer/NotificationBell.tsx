import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { timeAgo } from '@/utils/format';
import { useCustomer } from './auth';

/** Bell + unread badge + popover of the signed-in customer's own notifications. Renders nothing when signed out. */
export function NotificationBell({ className = '' }: { className?: string }) {
  const { status, notifications, unread, markRead, markAllRead } = useCustomer();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (status !== 'signedIn') return null;
  const recent = notifications.slice(0, 6);
  return (
    <div ref={root} className={`relative ${className}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="dialog"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative grid h-11 w-11 place-items-center rounded-md border border-line bg-card text-ink hover:bg-surface">
        <Bell className="h-[18px] w-[18px]" aria-hidden />
        {unread > 0 && <span aria-hidden className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="fixed inset-x-3 top-[68px] z-[60] animate-fade-in rounded-lg border border-line bg-card shadow-lift sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[22rem]">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
            <h2 className="text-sm">Notifications</h2>
            <button type="button" onClick={() => void markAllRead()} disabled={!unread} className="link inline-flex min-h-9 items-center gap-1.5 text-[13px] disabled:opacity-50 disabled:no-underline">
              <CheckCheck className="h-3.5 w-3.5" aria-hidden />Mark all read
            </button>
          </div>
          {recent.length ? (
            <ul className="max-h-[60dvh] divide-y divide-line overflow-y-auto">
              {recent.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => { if (!n.is_read) void markRead(n.id); }} className="flex w-full gap-3 px-4 py-3 text-left hover:bg-surface"
                    aria-label={`${n.title}. ${n.body}${n.is_read ? '' : ' Unread — activate to mark as read.'}`}>
                    <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.is_read ? 'bg-transparent' : 'bg-accent'}`} />
                    <span className="min-w-0">
                      <span className={`block text-sm ${n.is_read ? '' : 'font-semibold'}`}>{n.title}</span>
                      <span className="block text-[13px] text-muted">{n.body}</span>
                      <span className="block text-xs text-muted">{timeAgo(n.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="px-4 py-8 text-center text-sm text-muted">No notifications yet. Updates about your bookings appear here.</p>}
          <div className="border-t border-line px-4 py-2 text-center">
            <Link to="/account" onClick={() => setOpen(false)} className="link inline-flex min-h-9 items-center text-[13px]">Open my account</Link>
          </div>
        </div>
      )}
    </div>
  );
}
