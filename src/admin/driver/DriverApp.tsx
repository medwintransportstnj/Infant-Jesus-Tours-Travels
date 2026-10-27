import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, Route, Routes, useOutletContext } from 'react-router-dom';
import { CalendarClock, CheckCircle2, LogOut, MapPin, MessageCircle, Moon, Navigation, Phone, StickyNote, Sun, Users } from 'lucide-react';
import { LogoMark } from '@/components/site/Logo';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/Modal';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { LiveIndicator, PushToggle, SoundToggle } from '@/components/ui/LiveControls';
import { NotificationPanel } from '@/components/ui/NotificationPanel';
import { useToast } from '@/components/ui/Toast';
import { useTheme } from '@/hooks/useTheme';
import { supabase, timeoutSignal } from '@/lib/supabase';
import { subscribeLive } from '@/lib/live';
import { useNotificationFeed } from '@/lib/useNotificationFeed';
import { buildTelUrl } from '@/utils/phone';
import { buildWhatsAppUrl } from '@/utils/whatsapp';
import { formatDate, formatTime, timeAgo, todayIST } from '@/utils/format';
import type { Booking, DriverNotification } from '@/types/db';
import { useAuth } from '../auth';
import { useApiError } from '../data';

type Trip = Pick<Booking, 'id' | 'reference' | 'request_type' | 'status' | 'customer_name' | 'phone' | 'pickup' | 'destination' | 'dropoff'
  | 'travel_date' | 'travel_time' | 'members' | 'round_trip' | 'return_date' | 'return_time' | 'vehicle_name' | 'notes' | 'ac_preferred' | 'updated_at'>;
const COLUMNS = 'id,reference,request_type,status,customer_name,phone,pickup,destination,dropoff,travel_date,travel_time,members,round_trip,return_date,return_time,vehicle_name,notes,ac_preferred,updated_at';

interface DriverCtx { feed: ReturnType<typeof useNotificationFeed<DriverNotification>> }
const tripsLink = () => '/admin/trips';

function DriverLayout() {
  const { email, userId, signOut } = useAuth();
  const { mode, toggle } = useTheme();
  const feed = useNotificationFeed<DriverNotification>({ client: supabase, table: 'driver_notifications', ownerColumn: 'driver_id', userId, linkFor: tripsLink });
  useEffect(() => { document.title = 'My trips · Infant Jesus Tours & Travels'; }, []);
  const tab = ({ isActive }: { isActive: boolean }) => `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${isActive ? 'bg-white text-ink' : 'text-white/75 hover:text-white'}`;
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-40 bg-inverse text-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-2 px-3 sm:px-5">
          <LogoMark size={36} />
          <div className="min-w-0 flex-1"><p className="truncate text-[15px] font-semibold">Driver</p><p className="truncate text-xs text-white/60">{email}</p></div>
          <LiveIndicator inverse className="hidden xs:inline-flex" />
          <NotificationPanel items={feed.items} unread={feed.unread} onMarkRead={(id) => void feed.markRead(id)} onMarkAll={() => void feed.markAllRead()}
            linkFor={tripsLink} inverse buttonClassName="bg-white/10 text-white hover:bg-white/15" emptyText="New trips and changes to your trips appear here."
            footer={<><SoundToggle /><PushToggle client={supabase} userId={userId} /></>} />
          <button type="button" onClick={toggle} aria-label={mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} className="grid h-11 w-11 place-items-center rounded-full bg-white/10 hover:bg-white/15">
            {mode === 'dark' ? <Sun className="h-[18px] w-[18px]" aria-hidden /> : <Moon className="h-[18px] w-[18px]" aria-hidden />}
          </button>
          <button type="button" onClick={() => void signOut()} aria-label="Sign out" className="grid h-11 w-11 place-items-center rounded-full bg-white/10 hover:bg-white/15"><LogOut className="h-[18px] w-[18px]" aria-hidden /></button>
        </div>
        <nav aria-label="Driver" className="mx-auto flex max-w-3xl gap-1 px-3 pb-3 sm:px-5">
          <NavLink to="/admin/trips" className={tab}>My trips</NavLink>
          <NavLink to="/admin/updates" className={tab}>Updates{feed.unread > 0 && <span className="ml-1.5 rounded-full bg-accent px-1.5 text-[11px] text-white">{feed.unread}</span>}</NavLink>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-3xl p-3 sm:p-5"><Outlet context={{ feed } satisfies DriverCtx} /></main>
    </div>
  );
}

function TripCard({ trip, onComplete }: { trip: Trip; onComplete: (t: Trip) => void }) {
  const tel = buildTelUrl(trip.phone);
  const wa = buildWhatsAppUrl(trip.phone, `Hello ${trip.customer_name}, this is your driver from Infant Jesus Tours & Travels for trip ${trip.reference}.`);
  const route = [trip.pickup, trip.destination].filter(Boolean).join(' → ');
  const maps = trip.pickup ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(trip.pickup)}` : null;
  return (
    <article className="card overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div><p className="text-lg font-bold tracking-tight">{trip.reference}</p><p className="text-[13px] text-muted">{trip.request_type}{trip.vehicle_name ? ` · ${trip.vehicle_name}` : ''}</p></div>
        <StatusBadge status={trip.status} />
      </div>
      <div className="grid gap-3 px-4 py-4 text-sm">
        {route && <p className="flex items-start gap-2.5 font-semibold"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" aria-hidden />{route}</p>}
        {trip.dropoff && <p className="pl-[1.6rem] text-muted">Drop-off: {trip.dropoff}</p>}
        {trip.travel_date && (
          <p className="flex items-start gap-2.5"><CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" aria-hidden />
            <span>{formatDate(trip.travel_date)}, {formatTime(trip.travel_time)}{trip.round_trip && trip.return_date ? <span className="block text-muted">Return {formatDate(trip.return_date)}, {formatTime(trip.return_time)}</span> : null}</span>
          </p>
        )}
        <p className="flex items-center gap-2.5"><Users className="h-4 w-4 shrink-0 text-accent-text" aria-hidden />{trip.customer_name}{trip.members ? ` · ${trip.members} passengers` : ''}{trip.ac_preferred ? ' · AC preferred' : ''}</p>
        {trip.notes && <p className="flex items-start gap-2.5 whitespace-pre-line text-muted"><StickyNote className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{trip.notes}</p>}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-line bg-surface px-4 py-3">
        {tel && <a href={tel} className="btn-secondary btn-sm"><Phone className="h-4 w-4" aria-hidden />Call customer</a>}
        {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm"><MessageCircle className="h-4 w-4" aria-hidden />WhatsApp</a>}
        {maps && <a href={maps} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm"><Navigation className="h-4 w-4" aria-hidden />Directions to pickup</a>}
        {trip.status === 'Confirmed' && <Button size="sm" className="ml-auto" onClick={() => onComplete(trip)} icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}>Mark trip completed</Button>}
      </div>
    </article>
  );
}

function Trips() {
  const { userId } = useAuth();
  const apiError = useApiError();
  const toast = useToast();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'upcoming' | 'completed'>('upcoming');
  const [completing, setCompleting] = useState<Trip | null>(null);
  const [busy, setBusy] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error: err } = await supabase.from('bookings').select(COLUMNS).eq('driver_id', userId)
      .order('travel_date', { ascending: true, nullsFirst: true }).order('travel_time', { ascending: true }).limit(200).abortSignal(timeoutSignal());
    if (err) setError(apiError(err, 'Could not load your trips. Check the connection and try again.'));
    else { setTrips((data ?? []) as Trip[]); setError(null); }
    setLoading(false);
  }, [userId, apiError]);
  // Assignments, removals and changes arrive live; RLS only lets this driver's own trips through.
  useEffect(() => {
    if (!userId) return undefined;
    void load();
    return subscribeLive(supabase, 'driver-trips', [{ table: 'bookings', filter: `driver_id=eq.${userId}` }, { table: 'driver_notifications', filter: `driver_id=eq.${userId}` }], () => void load(), () => void load());
  }, [userId, load]);

  const today = todayIST();
  const { upcoming, completed } = useMemo(() => ({
    upcoming: trips.filter((t) => t.status !== 'Trip Completed'),
    completed: trips.filter((t) => t.status === 'Trip Completed').reverse(),
  }), [trips]);
  const todays = upcoming.filter((t) => t.travel_date === today).length;
  const list = view === 'upcoming' ? upcoming : completed;

  const complete = async () => {
    if (!completing) return;
    setBusy(true); setCompleteError(null);
    const { error: err } = await supabase.rpc('driver_complete_trip', { p_booking_id: completing.id });
    setBusy(false);
    if (err) { setCompleteError(apiError(err, 'Could not update the trip. Please try again.')); return; }
    toast.success('Trip completed', `${completing.reference} is marked as completed. The office has been told.`);
    setCompleting(null);
    void load();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">My trips</h1><p className="text-sm text-muted">{todays ? `${todays} trip${todays === 1 ? '' : 's'} today.` : 'No trips today.'} New assignments appear here instantly.</p></div>
        <div className="inline-flex rounded-full border border-line bg-card p-1" role="tablist" aria-label="Trips">
          {(['upcoming', 'completed'] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={`min-h-9 rounded-full px-4 text-sm font-semibold capitalize ${view === v ? 'bg-ink text-canvas' : 'text-muted hover:text-ink'}`}>
              {v} ({v === 'upcoming' ? upcoming.length : completed.length})
            </button>
          ))}
        </div>
      </div>
      {loading ? <div className="space-y-3" role="status" aria-label="Loading trips"><Skeleton className="h-48 w-full" /><Skeleton className="h-48 w-full" /></div>
        : error ? <ErrorState message={error} onRetry={() => { setLoading(true); void load(); }} />
        : list.length ? <ul className="flex flex-col gap-3">{list.map((t) => <li key={t.id}><TripCard trip={t} onComplete={(x) => { setCompleteError(null); setCompleting(x); }} /></li>)}</ul>
        : <EmptyState icon={<CalendarClock className="h-6 w-6" aria-hidden />} title={view === 'upcoming' ? 'No trips assigned' : 'No completed trips yet'}
            body={view === 'upcoming' ? 'When the office assigns you a trip, it appears here with a notification.' : 'Trips you mark as completed are listed here.'} />}
      <ConfirmDialog open={completing !== null} onCancel={() => setCompleting(null)} onConfirm={() => void complete()} busy={busy} error={completeError}
        title={`Mark ${completing?.reference ?? 'this trip'} as completed?`} confirmLabel="Mark completed"
        message="The office and the customer will be told the trip is completed." />
    </div>
  );
}

function Updates() {
  const { feed } = useOutletContext<DriverCtx>();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold">Updates</h1>
        <Button variant="secondary" size="sm" disabled={!feed.unread} onClick={() => void feed.markAllRead()}>Mark all read</Button>
      </div>
      {feed.loading ? <Skeleton className="h-32 w-full" /> : feed.items.length ? (
        <ul className="card divide-y divide-line">
          {feed.items.map((n) => (
            <li key={n.id} className={`flex items-start gap-3 px-4 py-3 ${n.is_read ? '' : 'bg-accent-soft/40'}`}>
              <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.is_read ? 'bg-line' : 'bg-accent'}`} />
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${n.is_read ? '' : 'font-semibold'}`}>{n.title}</p>
                <p className="text-[13px] text-muted">{n.body}</p>
                <p className="text-xs text-muted">{timeAgo(n.created_at)}</p>
              </div>
              {!n.is_read && <button type="button" className="link min-h-9 shrink-0 text-[13px]" onClick={() => void feed.markRead(n.id)}>Mark read</button>}
            </li>
          ))}
        </ul>
      ) : <EmptyState title="No updates yet" body="You'll be notified here when a trip is assigned to you or changes." action={<Link to="/admin/trips" className="btn-secondary">My trips</Link>} />}
    </div>
  );
}

export default function DriverApp() {
  return (
    <Routes>
      <Route element={<DriverLayout />}>
        <Route path="trips" element={<Trips />} />
        <Route path="updates" element={<Updates />} />
        <Route path="*" element={<Navigate to="/admin/trips" replace />} />
      </Route>
    </Routes>
  );
}
