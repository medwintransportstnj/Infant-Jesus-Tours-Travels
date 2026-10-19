import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Bell, CalendarX, CheckCheck, LogOut } from 'lucide-react';
import { Seo } from '@/components/site/Seo';
import { PageHeader } from '@/components/site/Parts';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { Field, FormError } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { friendlyError } from '@/lib/errors';
import { siteClient, timeoutSignal } from '@/lib/supabase';
import { formatDate, formatDateTime, formatTime, timeAgo } from '@/utils/format';
import { validateName, validatePhone } from '@/utils/validation';
import type { Booking } from '@/types/db';
import { useCustomer } from '../auth';

type OwnBooking = Pick<Booking, 'id' | 'reference' | 'request_type' | 'status' | 'travel_date' | 'travel_time' | 'pickup' | 'destination' | 'vehicle_name' | 'subject_title' | 'created_at'>;
const COLUMNS = 'id,reference,request_type,status,travel_date,travel_time,pickup,destination,vehicle_name,subject_title,created_at';

export default function Account() {
  const customer = useCustomer();
  const toast = useToast();
  const location = useLocation();
  const { userId, profile } = customer;
  const [bookings, setBookings] = useState<OwnBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ full_name: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => { if (profile) setF({ full_name: profile.full_name, phone: profile.phone }); }, [profile]);

  const load = useCallback(async () => {
    if (!userId) return;
    // RLS already limits this to the customer's own rows; the explicit filter keeps it that way even for an
    // account that also happens to be an admin.
    const { data, error: err } = await siteClient.from('bookings').select(COLUMNS).eq('customer_id', userId).order('created_at', { ascending: false }).limit(100).abortSignal(timeoutSignal());
    if (err) setError(friendlyError(err, 'Could not load your bookings. Please try again.'));
    else { setBookings((data ?? []) as OwnBooking[]); setError(null); }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    void load();
    // Status changes made by the office arrive live; the list refreshes without a reload.
    const channel = siteClient.channel(`customer-bookings-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `customer_id=eq.${userId}` }, () => void load())
      .subscribe();
    return () => { void siteClient.removeChannel(channel); };
  }, [userId, load]);
  // A status notification also means a booking changed — keeps history fresh even if the bookings event is missed.
  const latest = customer.notifications[0]?.id;
  useEffect(() => { if (latest) void load(); }, [latest, load]);

  if (customer.status === 'loading') return <div className="container-page py-12" role="status" aria-label="Loading"><Skeleton className="h-40 w-full" /></div>;
  if (customer.status !== 'signedIn') return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const invalid = validateName(f.full_name) ?? validatePhone(f.phone);
    if (invalid) { setFormError(invalid); return; }
    setSaving(true); setFormError(null);
    try { await customer.updateProfile(f); toast.success('Profile saved'); }
    catch (err) { setFormError(friendlyError(err, 'Could not save your profile. Please try again.')); }
    finally { setSaving(false); }
  };

  return (
    <div className="container-page py-8 sm:py-12">
      <Seo title="My account" noindex />
      <PageHeader title="My account" intro="Your details, bookings and updates. Only you can see this page.">
        <Button variant="secondary" onClick={() => void customer.signOut()} icon={<LogOut className="h-4 w-4" aria-hidden />}>Logout</Button>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.7fr]">
        <div className="flex flex-col gap-6">
          <section className="card p-4 sm:p-5" aria-labelledby="profile-heading">
            <h2 id="profile-heading" className="mb-3 text-base">Profile</h2>
            <form onSubmit={save} noValidate className="flex flex-col gap-4">
              <Field label="Full name" required><input className="input" autoComplete="name" maxLength={80} value={f.full_name} onChange={(e) => setF((p) => ({ ...p, full_name: e.target.value }))} /></Field>
              <Field label="Email" hint="Your login. It cannot be changed here."><input className="input" value={customer.email ?? ''} readOnly disabled /></Field>
              <Field label="Phone number" required><input className="input" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} value={f.phone} onChange={(e) => setF((p) => ({ ...p, phone: e.target.value }))} /></Field>
              <FormError>{formError}</FormError>
              <Button type="submit" variant="secondary" loading={saving} loadingText="Saving…" className="self-start">Save profile</Button>
            </form>
          </section>
          <section className="card p-4 sm:p-5" aria-labelledby="notif-heading" id="notifications">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 id="notif-heading" className="text-base">Recent notifications</h2>
              <button type="button" className="link inline-flex min-h-9 items-center gap-1.5 text-[13px] disabled:opacity-50" disabled={!customer.unread} onClick={() => void customer.markAllRead()}><CheckCheck className="h-3.5 w-3.5" aria-hidden />Mark all read</button>
            </div>
            {customer.notifications.length ? (
              <ul className="divide-y divide-line">
                {customer.notifications.slice(0, 10).map((n) => (
                  <li key={n.id} className="flex items-start gap-3 py-2.5">
                    <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.is_read ? 'bg-line' : 'bg-accent'}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${n.is_read ? '' : 'font-semibold'}`}>{n.title}{!n.is_read && <span className="sr-only"> (unread)</span>}</p>
                      <p className="text-[13px] text-muted">{n.body}</p>
                      <p className="text-xs text-muted">{timeAgo(n.created_at)}</p>
                    </div>
                    {!n.is_read && <button type="button" onClick={() => void customer.markRead(n.id)} className="link min-h-9 shrink-0 text-[13px]">Mark read</button>}
                  </li>
                ))}
              </ul>
            ) : <p className="flex items-center gap-2 py-4 text-sm text-muted"><Bell className="h-4 w-4" aria-hidden />No notifications yet.</p>}
          </section>
        </div>

        <section aria-labelledby="history-heading">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="history-heading" className="text-base">Booking history</h2>
            <Link to="/book" className="btn-primary btn-sm">New booking</Link>
          </div>
          {loading ? <div className="space-y-3" role="status" aria-label="Loading bookings"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
            : error ? <ErrorState message={error} onRetry={() => { setLoading(true); void load(); }} />
            : bookings.length ? (
              <ul className="flex flex-col gap-3">
                {bookings.map((b) => (
                  <li key={b.id} className="card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div><p className="text-lg font-bold tracking-tight">{b.reference}</p><p className="text-[13px] text-muted">{b.request_type}</p></div>
                      <StatusBadge status={b.status} />
                    </div>
                    <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                      {b.pickup && <div className="flex justify-between gap-3 sm:block"><dt className="text-muted">Pickup</dt><dd className="font-medium">{b.pickup}</dd></div>}
                      {b.destination && <div className="flex justify-between gap-3 sm:block"><dt className="text-muted">Destination</dt><dd className="font-medium">{b.destination}</dd></div>}
                      {b.travel_date && <div className="flex justify-between gap-3 sm:block"><dt className="text-muted">Date &amp; time</dt><dd className="font-medium">{formatDate(b.travel_date)}, {formatTime(b.travel_time)}</dd></div>}
                      {b.vehicle_name && <div className="flex justify-between gap-3 sm:block"><dt className="text-muted">Vehicle</dt><dd className="font-medium">{b.vehicle_name}</dd></div>}
                      {b.subject_title && <div className="flex justify-between gap-3 sm:block"><dt className="text-muted">About</dt><dd className="font-medium">{b.subject_title}</dd></div>}
                      <div className="flex justify-between gap-3 sm:block"><dt className="text-muted">Requested</dt><dd className="font-medium">{formatDateTime(b.created_at)}</dd></div>
                    </dl>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="card flex flex-col items-center px-6 py-10 text-center">
                <CalendarX className="mb-2 h-6 w-6 text-muted" aria-hidden />
                <p className="text-sm font-semibold">No bookings yet</p>
                <p className="mt-1 text-sm text-muted">Requests you make while signed in will appear here.</p>
                <Link to="/book" className="btn-primary mt-4">Book a Vehicle</Link>
              </div>
            )}
        </section>
      </div>
    </div>
  );
}
