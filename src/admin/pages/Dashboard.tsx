import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarX, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { supabase, timeoutSignal } from '@/lib/supabase';
import { formatDate, timeAgo } from '@/utils/format';
import type { AppNotification, Booking, DashboardStats } from '@/types/db';
import { useApiError, useRealtime } from '../data';

/** 7-day chart drawn from real counts returned by admin_dashboard(). */
function Chart({ daily }: { daily: DashboardStats['daily'] }) {
  const max = Math.max(1, ...daily.map((d) => d.total));
  const w = 560, h = 190, padX = 28, top = 14, bottom = 30;
  const x = (i: number) => padX + (i * (w - padX * 2)) / Math.max(1, daily.length - 1);
  const y = (v: number) => h - bottom - (v / max) * (h - top - bottom);
  const path = (key: 'total' | 'confirmed') => daily.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d[key]).toFixed(1)}`).join(' ');
  if (!daily.some((d) => d.total)) return <p className="py-10 text-center text-sm text-muted">No requests in the last 7 days. This chart fills in as bookings arrive.</p>;
  const summary = daily.map((d) => `${formatDate(d.day)}: ${d.total} requests, ${d.confirmed} confirmed`).join('; ');
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-48 w-full" role="img" aria-label={`Requests over the last 7 days. ${summary}`}>
        {[0, 0.5, 1].map((f) => <line key={f} x1={padX} x2={w - padX} y1={y(max * f)} y2={y(max * f)} className="stroke-line" strokeWidth="1" />)}
        {[0, 0.5, 1].map((f) => <text key={f} x={padX - 8} y={y(max * f) + 3} textAnchor="end" className="fill-muted text-[10px]">{Math.round(max * f)}</text>)}
        <path d={path('total')} fill="none" className="stroke-accent" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d={path('confirmed')} fill="none" className="stroke-success" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5 4" />
        {daily.map((d, i) => <circle key={d.day} cx={x(i)} cy={y(d.total)} r="3.5" className="fill-accent" />)}
        {daily.map((d, i) => <text key={d.day} x={x(i)} y={h - 8} textAnchor="middle" className="fill-muted text-[10px]">{formatDate(d.day).slice(0, 6)}</text>)}
      </svg>
      <figcaption className="mt-2 flex gap-5 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 bg-accent" aria-hidden />All requests</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0 w-5 border-t-2 border-dashed border-success" aria-hidden />Confirmed</span>
      </figcaption>
    </figure>
  );
}

export default function Dashboard() {
  const apiError = useApiError();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<Booking[]>([]);
  const [activity, setActivity] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, b, n] = await Promise.all([
      supabase.rpc('admin_dashboard').abortSignal(timeoutSignal()),
      supabase.from('bookings').select('*').order('created_at', { ascending: false }).limit(5).abortSignal(timeoutSignal()),
      supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(5).abortSignal(timeoutSignal()),
    ]);
    const failure = s.error ?? b.error ?? n.error;
    if (failure) setError(apiError(failure, 'Could not load the dashboard. Check the connection and try again.'));
    else { setStats(s.data as DashboardStats); setRecent((b.data ?? []) as Booking[]); setActivity((n.data ?? []) as AppNotification[]); setError(null); }
    setLoading(false); setRefreshing(false);
  }, [apiError]);
  useEffect(() => { void load(); }, [load]);
  // Every figure here is live: a new booking, message or content change triggers a refetch.
  useRealtime(['bookings', 'contact_messages', 'notifications', 'vehicles', 'offers'], () => void load(), 500);

  const cards: [string, number | undefined, string][] = [
    ['Total Bookings', stats?.total_bookings, '/admin/bookings'], ['Pending', stats?.pending, '/admin/bookings'],
    ['Confirmed', stats?.confirmed, '/admin/bookings'], ['Completed', stats?.completed, '/admin/bookings'],
    ['New Messages', stats?.new_messages, '/admin/contacts'], ['Active Vehicles', stats?.active_vehicles, '/admin/vehicles'],
    ['Active Offers', stats?.active_offers, '/admin/offers'],
  ];

  if (error && !stats) return <ErrorState message={error} onRetry={() => { setLoading(true); void load(); }} />;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">Live operational summary</p>
        <Button variant="secondary" loading={refreshing} onClick={() => { setRefreshing(true); void load(); }} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>Refresh</Button>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7">
        {cards.map(([label, value, to]) => (
          <li key={label}>
            <Link to={to} className="card block p-4 transition-colors hover:border-accent/50">
              <p className="text-[13px] text-muted">{label}</p>
              {loading ? <Skeleton className="mt-2 h-8 w-12" /> : <p className="mt-1 text-3xl font-bold tracking-tight">{value ?? '—'}</p>}
              <p className="mt-1 text-[11px] text-muted">Live data</p>
            </Link>
          </li>
        ))}
      </ul>
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <section className="card p-4 sm:p-5" aria-labelledby="chart-heading">
          <h2 id="chart-heading" className="mb-3 text-base">Requests — last 7 days</h2>
          {loading || !stats ? <Skeleton className="h-48 w-full" /> : <Chart daily={stats.daily} />}
        </section>
        <section className="card p-4 sm:p-5" aria-labelledby="activity-heading">
          <div className="mb-3 flex items-center justify-between"><h2 id="activity-heading" className="text-base">Activity</h2><Link to="/admin/notifications" className="link text-[13px]">View all</Link></div>
          {loading ? <Skeleton className="h-32 w-full" /> : activity.length ? (
            <ul className="divide-y divide-line">
              {activity.map((n) => (
                <li key={n.id} className="py-2.5 first:pt-0 last:pb-0">
                  <p className={`text-sm ${n.is_read ? '' : 'font-semibold'}`}>{n.title}</p>
                  <p className="text-[13px] text-muted">{n.body}</p>
                  <p className="text-xs text-muted">{timeAgo(n.created_at)}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">Live booking and contact activity will appear here.</p>}
        </section>
      </div>
      <section className="card p-4 sm:p-5" aria-labelledby="recent-heading">
        <div className="mb-3 flex items-center justify-between"><h2 id="recent-heading" className="text-base">Recent bookings</h2><Link to="/admin/bookings" className="link inline-flex items-center gap-1 text-[13px]">All bookings<ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link></div>
        {loading ? <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div> : recent.length ? (
          <ul className="divide-y divide-line">
            {recent.map((b) => (
              <li key={b.id}>
                <Link to={`/admin/bookings?q=${encodeURIComponent(b.reference)}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-surface">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{b.customer_name} <span className="font-normal text-muted">· {b.reference} · {b.request_type}</span></span>
                    <span className="block truncate text-[13px] text-muted">{b.pickup && b.destination ? `${b.pickup} → ${b.destination}` : b.subject_title || b.pickup || 'Quick request'} · {timeAgo(b.created_at)}</span>
                  </span>
                  <StatusBadge status={b.status} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center rounded-md bg-sunken py-8 text-center text-sm text-muted"><CalendarX className="mb-2 h-5 w-5" aria-hidden />No bookings yet. New requests appear here instantly.</div>
        )}
      </section>
    </div>
  );
}
