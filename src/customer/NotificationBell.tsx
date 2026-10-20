import { Link } from 'react-router-dom';
import { NotificationPanel } from '@/components/ui/NotificationPanel';
import { PushToggle, SoundToggle } from '@/components/ui/LiveControls';
import { siteClient } from '@/lib/supabase';
import { useCustomer } from './auth';

/** Bell + unread badge + popover of the signed-in customer's own notifications. Renders nothing when signed out. */
export function NotificationBell({ className = '' }: { className?: string }) {
  const { status, userId, notifications, unread, markRead, markAllRead } = useCustomer();
  if (status !== 'signedIn') return null;
  return (
    <div className={className}>
      <NotificationPanel items={notifications} unread={unread} onMarkRead={(id) => void markRead(id)} onMarkAll={() => void markAllRead()}
        linkFor={() => '/account'} buttonClassName="border border-line bg-card text-ink hover:bg-sunken"
        emptyText="No notifications yet. Updates about your bookings appear here."
        footer={<>
          <div className="flex flex-wrap items-center justify-between gap-1"><SoundToggle /><Link to="/account" className="link inline-flex min-h-11 items-center px-3 text-sm">My account</Link></div>
          <PushToggle client={siteClient} userId={userId} />
        </>} />
    </div>
  );
}
