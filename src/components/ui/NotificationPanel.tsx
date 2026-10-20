import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { timeAgo } from '@/utils/format';
import type { FeedItem } from '@/lib/useNotificationFeed';

interface Props<T extends FeedItem> {
  items: T[];
  unread: number;
  onMarkRead: (id: string) => void;
  onMarkAll: () => void;
  linkFor: (item: T) => string | undefined;
  /** Shown under the list: sound and device-notification switches, "View all" link… */
  footer?: ReactNode;
  emptyText?: string;
  buttonClassName?: string;
  /** Badge style on a dark header. */
  inverse?: boolean;
}

/** Bell button + unread badge + popover list. Shared by office staff, drivers and customers. */
export function NotificationPanel<T extends FeedItem>({ items, unread, onMarkRead, onMarkAll, linkFor, footer, emptyText = 'No notifications yet.', buttonClassName = '', inverse = false }: Props<T>) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const select = (n: T) => {
    if (!n.is_read) onMarkRead(n.id);
    const href = linkFor(n);
    setOpen(false);
    if (href) navigate(href);
  };

  return (
    <div ref={root} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="dialog"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        className={`relative grid h-11 w-11 place-items-center rounded-full transition-colors ${buttonClassName}`}>
        <Bell className="h-[18px] w-[18px]" aria-hidden />
        {unread > 0 && (
          <span aria-hidden className={`absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-white ring-2 ${inverse ? 'ring-inverse' : 'ring-card'}`}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications"
          className="fixed inset-x-3 top-[68px] z-[60] animate-rise-in overflow-hidden rounded-2xl border border-line bg-card text-ink shadow-lift sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[24rem]">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h2 className="text-[15px] font-semibold">Notifications{unread > 0 && <span className="ml-1.5 text-muted">({unread} unread)</span>}</h2>
            <button type="button" onClick={onMarkAll} disabled={!unread} className="link inline-flex min-h-9 items-center gap-1.5 text-[13px] disabled:opacity-40 disabled:no-underline">
              <CheckCheck className="h-3.5 w-3.5" aria-hidden />Mark all read
            </button>
          </div>
          {items.length ? (
            <ul className="max-h-[min(60dvh,26rem)] divide-y divide-line overflow-y-auto">
              {items.slice(0, 10).map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => select(n)} className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-sunken ${n.is_read ? '' : 'bg-accent-soft/40'}`}>
                    <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.is_read ? 'bg-transparent' : 'bg-accent'}`} />
                    <span className="min-w-0">
                      <span className={`block text-sm ${n.is_read ? '' : 'font-semibold'}`}>{n.title}{!n.is_read && <span className="sr-only"> (unread)</span>}</span>
                      <span className="block text-[13px] text-muted">{n.body}</span>
                      <span className="mt-0.5 block text-xs text-muted">{timeAgo(n.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="px-4 py-10 text-center text-sm text-muted">{emptyText}</p>}
          {footer && <div className="border-t border-line bg-surface px-2 py-2">{footer}</div>}
        </div>
      )}
    </div>
  );
}
