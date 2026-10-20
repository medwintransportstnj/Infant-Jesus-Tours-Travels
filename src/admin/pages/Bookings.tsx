import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarCheck, ChevronLeft, ChevronRight, Download, Eye, Pencil, Route, Search, Tag, Trash2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { Field, FormError } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Toggle } from '@/components/ui/Toggle';
import { useToast } from '@/components/ui/Toast';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import { supabase, timeoutSignal } from '@/lib/supabase';
import { formatDate, formatDateTime, formatTime } from '@/utils/format';
import { validateName, validatePhone } from '@/utils/validation';
import { BOOKING_STATUSES, REQUEST_TYPES, type AdminUser, type Booking, type BookingStatus, type RequestType } from '@/types/db';
import { useApiError, useRealtime } from '../data';

const PAGE_SIZE = 25;
const EXPORT_LIMIT = 5000;
interface Filters { q: string; type: '' | RequestType; status: '' | BookingStatus; from: string; to: string }
const NO_FILTERS: Filters = { q: '', type: '', status: '', from: '', to: '' };
const TYPE_ICON = { 'Vehicle Booking': Route, 'Instant Ride': Zap, 'Offer Enquiry': Tag, 'Package Enquiry': Tag } as const;

/** Filtering happens in Postgres (indexed), not in the browser, so it stays fast as bookings grow. */
function buildQuery(f: Filters) {
  let q = supabase.from('bookings').select('*', { count: 'exact' });
  // Strip characters that have meaning in PostgREST filter syntax so search text cannot alter the query.
  const term = f.q.trim().replace(/[,()*%\\"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (term) q = q.or(['reference', 'customer_name', 'phone', 'pickup', 'destination'].map((c) => `${c}.ilike.%${term}%`).join(','));
  if (f.type) q = q.eq('request_type', f.type);
  if (f.status) q = q.eq('status', f.status);
  // created_at is stored in UTC; the filter dates are India calendar days.
  if (f.from) q = q.gte('created_at', `${f.from}T00:00:00+05:30`);
  if (f.to) q = q.lte('created_at', `${f.to}T23:59:59.999+05:30`);
  return q.order('created_at', { ascending: false });
}

function details(b: Booking): string {
  if (b.request_type === 'Vehicle Booking') return `${b.pickup} → ${b.destination}${b.round_trip ? ' (Round trip)' : ''}`;
  if (b.request_type === 'Instant Ride') return b.pickup ? `Instant ride from ${b.pickup}${b.destination ? ` to ${b.destination}` : ''}` : 'Instant ride request';
  return b.subject_title || b.request_type;
}
function detailRows(b: Booking, driver: string | null): [string, string][] {
  const rows: [string, string | null | undefined][] = [
    ['Reference ID', b.reference], ['Request type', b.request_type], ['Status', b.status], ['Full name', b.customer_name], ['Phone', b.phone], ['Email', b.email],
    ['Pickup location', b.pickup], ['Destination', b.destination], ['Drop-off location', b.dropoff],
    ['Pickup date', b.travel_date ? formatDate(b.travel_date) : null], ['Pickup time', b.travel_time ? `${formatTime(b.travel_time)}${b.flexible_time ? ' (flexible)' : ''}` : null],
    ['Number of members', b.members?.toString()], ['Round trip', b.request_type === 'Vehicle Booking' ? (b.round_trip ? 'Yes' : 'No') : null],
    ['Return date', b.return_date ? formatDate(b.return_date) : null], ['Return time', b.return_time ? formatTime(b.return_time) : null],
    ['Selected vehicle', b.request_type === 'Vehicle Booking' ? b.vehicle_name || 'Not chosen — recommend one' : null],
    ['AC preferred', b.ac_preferred === null ? null : b.ac_preferred ? 'Yes' : 'No'],
    ['Driver', driver],
    ['Package / offer', b.subject_title], ['Special requirements', b.notes], ['Created', formatDateTime(b.created_at)], ['Last updated', formatDateTime(b.updated_at)],
  ];
  return rows.filter((r): r is [string, string] => Boolean(r[1]));
}

export default function Bookings() {
  const toast = useToast();
  const apiError = useApiError();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => ({ ...NO_FILTERS, q: params.get('q') ?? '' }));
  const [applied, setApplied] = useState<Filters>(filters);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Booking[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Booking | null>(null);
  const [editing, setEditing] = useState<Booking | null>(null);
  const [deleting, setDeleting] = useState<Booking | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [drivers, setDrivers] = useState<AdminUser[]>([]);
  const [driverBusy, setDriverBusy] = useState<string | null>(null);
  const requestId = useRef(0);

  // Debounce typing so each keystroke is not a database query.
  useEffect(() => { const t = window.setTimeout(() => { setApplied(filters); setPage(0); }, 300); return () => window.clearTimeout(t); }, [filters]);

  const load = useCallback(async () => {
    const mine = ++requestId.current;
    const { data, count, error: err } = await buildQuery(applied).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1).abortSignal(timeoutSignal());
    if (mine !== requestId.current) return; // a newer request superseded this one
    if (err) setError(apiError(err, 'Could not load bookings. Check the connection and try again.'));
    else { setRows((data ?? []) as Booking[]); setTotal(count ?? 0); setError(null); }
    setLoading(false);
  }, [applied, page, apiError]);
  useEffect(() => { setLoading(true); void load(); }, [load]);
  // New bookings and status changes from other admins appear without a refresh.
  useRealtime(['bookings'], () => void load());

  // Drivers for the "Driver" dropdown (owner adds them in Staff & Drivers).
  useEffect(() => {
    void supabase.rpc('admin_list').then(({ data, error: err }) => {
      if (err) { console.error('[ijt] could not load drivers', err); return; }
      setDrivers(((data ?? []) as AdminUser[]).filter((a) => a.role === 'driver'));
    });
  }, []);
  const driverName = useCallback((id: string | null) => {
    if (!id) return null;
    const d = drivers.find((x) => x.user_id === id);
    return d ? d.full_name || d.email : 'Former driver';
  }, [drivers]);

  const assignDriver = async (b: Booking, driverId: string) => {
    const next = driverId || null;
    if (next === b.driver_id) return;
    setDriverBusy(b.id);
    const { data, error: err } = await supabase.from('bookings').update({ driver_id: next }).eq('id', b.id).select('id');
    setDriverBusy(null);
    if (err || !data?.length) { toast.error('Could not assign the driver', apiError(err ?? { code: '42501' }, 'Please try again.')); return; }
    setRows((list) => list.map((r) => (r.id === b.id ? { ...r, driver_id: next } : r)));
    toast.success(next ? 'Driver assigned' : 'Driver removed', next ? `${driverName(next)} has been notified about ${b.reference}.` : `${b.reference} has no driver now.`);
  };

  const setFilter = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const hasFilters = Object.values(applied).some(Boolean);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const changeStatus = async (b: Booking, status: BookingStatus) => {
    if (status === b.status) return;
    setStatusBusy(b.id);
    const { data, error: err } = await supabase.from('bookings').update({ status }).eq('id', b.id).select('id');
    setStatusBusy(null);
    if (err || !data?.length) { toast.error('Could not update status', apiError(err ?? { code: '42501' }, 'Please try again.')); return; }
    setRows((list) => list.map((r) => (r.id === b.id ? { ...r, status } : r)));
    toast.success('Status updated', `${b.reference} is now "${status}".`);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true); setDeleteError(null);
    const { data, error: err } = await supabase.from('bookings').delete().eq('id', deleting.id).select('id');
    setDeleteBusy(false);
    if (err || !data?.length) { setDeleteError(apiError(err ?? { code: '42501' }, 'Could not delete. Check the connection and try again.')); return; }
    toast.success('Request deleted', deleting.reference);
    setDeleting(null);
    void load();
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const { data, error: err } = await buildQuery(applied).limit(EXPORT_LIMIT);
      if (err) throw err;
      const list = (data ?? []) as Booking[];
      if (!list.length) { toast.info('Nothing to export', 'No bookings match the current filters.'); return; }
      const columns: [string, (b: Booking) => string | number, number][] = [
        ['Reference ID', (b) => b.reference, 14], ['Request Type', (b) => b.request_type, 18], ['Status', (b) => b.status, 16],
        ['Full Name', (b) => b.customer_name, 24], ['Phone Number', (b) => b.phone, 18], ['Email', (b) => b.email ?? '', 26],
        ['Pickup Location', (b) => b.pickup ?? '', 26], ['Destination', (b) => b.destination ?? '', 26], ['Drop-off Location', (b) => b.dropoff ?? '', 26],
        ['Pickup Date', (b) => (b.travel_date ? formatDate(b.travel_date) : ''), 14], ['Pickup Time', (b) => (b.travel_time ? formatTime(b.travel_time) : ''), 12],
        ['Members Count', (b) => b.members ?? '', 10], ['Selected Vehicle', (b) => b.vehicle_name ?? '', 22], ['Driver', (b) => driverName(b.driver_id) ?? '', 20],
        ['Round Trip', (b) => (b.request_type === 'Vehicle Booking' ? (b.round_trip ? 'Yes' : 'No') : ''), 10],
        ['Return Date', (b) => (b.return_date ? formatDate(b.return_date) : ''), 14], ['Return Time', (b) => (b.return_time ? formatTime(b.return_time) : ''), 12],
        ['Package/Offer', (b) => b.subject_title ?? '', 24], ['Notes', (b) => b.notes ?? '', 40], ['Created At (IST)', (b) => formatDateTime(b.created_at), 24],
      ];
      // Loaded on demand so the spreadsheet writer never weighs down the rest of the app.
      const { default: writeXlsxFile } = await import('write-excel-file/browser');
      const sheet = [
        columns.map(([title]) => ({ value: title, fontWeight: 'bold' as const })),
        ...list.map((b) => columns.map(([, get]) => { const v = get(b); return typeof v === 'number' ? { value: v, type: Number } : { value: String(v), type: String }; })),
      ];
      await writeXlsxFile(sheet, { sheet: 'Bookings', columns: columns.map(([, , width]) => ({ width })), stickyRowsCount: 1 })
        .toFile(`IJT-Bookings-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success(`Exported ${list.length} record${list.length === 1 ? '' : 's'}`, list.length === EXPORT_LIMIT ? `Limited to the latest ${EXPORT_LIMIT}. Narrow the date range for the rest.` : undefined);
    } catch (err) {
      toast.error('Export failed', apiError(err, 'The Excel file could not be generated. Please try again.'));
    } finally { setExporting(false); }
  };

  const statusSelect = (b: Booking) => (
    <select aria-label={`Status for ${b.reference}`} className="input min-h-11 w-full min-w-[9.5rem] py-0 text-[13px]" value={b.status} disabled={statusBusy === b.id}
      onChange={(e) => void changeStatus(b, e.target.value as BookingStatus)}>
      {BOOKING_STATUSES.map((s) => <option key={s}>{s}</option>)}
    </select>
  );
  const canHaveDriver = (b: Booking) => b.request_type === 'Vehicle Booking' || b.request_type === 'Instant Ride';
  const driverSelect = (b: Booking) => canHaveDriver(b) ? (
    <select aria-label={`Driver for ${b.reference}`} className="input min-h-11 w-full min-w-[9.5rem] py-0 text-[13px]" value={b.driver_id ?? ''} disabled={driverBusy === b.id || (!drivers.length && !b.driver_id)}
      onChange={(e) => void assignDriver(b, e.target.value)}>
      <option value="">{drivers.length ? 'No driver' : 'No drivers added'}</option>
      {drivers.map((d) => <option key={d.user_id} value={d.user_id}>{d.full_name || d.email}</option>)}
      {b.driver_id && !drivers.some((d) => d.user_id === b.driver_id) && <option value={b.driver_id}>Former driver</option>}
    </select>
  ) : <span className="text-[13px] text-muted">—</span>;
  const iconBtn = 'grid h-11 w-11 shrink-0 place-items-center rounded-md border border-line bg-card hover:bg-sunken';
  const actions = (b: Booking) => (
    <>
      <button type="button" className={iconBtn} onClick={() => setViewing(b)} aria-label={`View ${b.reference}`}><Eye className="h-4 w-4" aria-hidden /></button>
      <button type="button" className={iconBtn} onClick={() => setEditing(b)} aria-label={`Edit ${b.reference}`}><Pencil className="h-4 w-4" aria-hidden /></button>
      <button type="button" className={`${iconBtn} text-danger`} onClick={() => { setDeleteError(null); setDeleting(b); }} aria-label={`Delete ${b.reference}`}><Trash2 className="h-4 w-4" aria-hidden /></button>
    </>
  );

  return (
    <div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_auto] lg:items-end">
        <div className="relative">
          <Field label="Search">
            <input type="search" className="input pl-9" placeholder="Reference, name, phone, place" value={filters.q}
              onChange={(e) => { setFilter('q', e.target.value); if (params.has('q')) setParams({}, { replace: true }); }} />
          </Field>
          <Search className="pointer-events-none absolute bottom-3.5 left-3 h-4 w-4 text-muted" aria-hidden />
        </div>
        <Field label="Type"><select className="input" value={filters.type} onChange={(e) => setFilter('type', e.target.value as Filters['type'])}><option value="">All enquiries</option>{REQUEST_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Status"><select className="input" value={filters.status} onChange={(e) => setFilter('status', e.target.value as Filters['status'])}><option value="">All statuses</option>{BOOKING_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Created from"><input type="date" className="input" value={filters.from} max={filters.to || undefined} onChange={(e) => setFilter('from', e.target.value)} /></Field>
        <Field label="Created to"><input type="date" className="input" value={filters.to} min={filters.from || undefined} onChange={(e) => setFilter('to', e.target.value)} /></Field>
        <Button variant="secondary" onClick={() => void exportExcel()} loading={exporting} loadingText="Exporting…" icon={<Download className="h-4 w-4" aria-hidden />}>Export</Button>
      </div>
      <div className="mb-3 flex min-h-9 items-center justify-between gap-3 text-[13px] text-muted">
        <p aria-live="polite">{loading ? 'Loading…' : `${total} request${total === 1 ? '' : 's'}${hasFilters ? ' match the filters' : ''}`}</p>
        {hasFilters && <button type="button" className="link min-h-9" onClick={() => setFilters(NO_FILTERS)}>Clear filters</button>}
      </div>

      {loading && !rows.length ? (
        <div className="space-y-3" role="status" aria-label="Loading bookings">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : error ? <ErrorState message={error} onRetry={() => { setLoading(true); void load(); }} /> : !rows.length ? (
        <EmptyState icon={<CalendarCheck className="h-6 w-6" aria-hidden />} title={hasFilters ? 'No requests match the search or filters' : 'No bookings or enquiries yet'}
          body={hasFilters ? 'Try a different search or clear the filters.' : 'New requests from the website will appear here instantly.'} />
      ) : (
        <>
          {/* Desktop: table */}
          <div className="card hidden overflow-x-auto xl:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Bookings and enquiries</caption>
              <thead className="border-b border-line bg-surface text-xs text-muted">
                <tr>{['Reference', 'Type', 'Customer', 'Details', 'Travel date', 'Created', 'Status', 'Driver', 'Actions'].map((h) => <th key={h} scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((b) => {
                  const Icon = TYPE_ICON[b.request_type] ?? Route;
                  return (
                    <tr key={b.id} className="align-middle">
                      <th scope="row" className="whitespace-nowrap px-4 py-3 font-bold text-accent-text">{b.reference}</th>
                      <td className="whitespace-nowrap px-4 py-3"><span className="inline-flex items-center gap-1.5 text-[13px]"><Icon className="h-3.5 w-3.5 text-accent-text" aria-hidden />{b.request_type}</span></td>
                      <td className="px-4 py-3"><span className="block font-semibold">{b.customer_name}</span><a href={`tel:${b.phone.replace(/[^\d+]/g, '')}`} className="text-[13px] text-muted hover:underline">{b.phone}</a></td>
                      <td className="max-w-[18rem] px-4 py-3 text-muted"><span className="line-clamp-2">{details(b)}</span>{b.request_type === 'Vehicle Booking' && <span className="block text-[13px]">Vehicle: {b.vehicle_name || '—'} · {b.members} pax</span>}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">{b.travel_date ? <>{formatDate(b.travel_date)}<span className="block text-[13px]">{formatTime(b.travel_time)}</span></> : '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-[13px] text-muted">{formatDateTime(b.created_at)}</td>
                      <td className="px-4 py-3">{statusSelect(b)}</td>
                      <td className="px-4 py-3">{driverSelect(b)}</td>
                      <td className="px-4 py-3"><div className="flex gap-1.5">{actions(b)}</div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Mobile & tablet: readable cards instead of a dense table */}
          <ul className="grid gap-3 md:grid-cols-2 xl:hidden">
            {rows.map((b) => {
              const Icon = TYPE_ICON[b.request_type] ?? Route;
              return (
                <li key={b.id} className="card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><p className="font-bold">{b.reference}</p><p className="truncate text-[13px] text-muted">{b.customer_name} · <a href={`tel:${b.phone.replace(/[^\d+]/g, '')}`} className="hover:underline">{b.phone}</a></p></div>
                    <StatusBadge status={b.status} />
                  </div>
                  <div className="mt-3 flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-text"><Icon className="h-4 w-4" aria-hidden /></span>
                    <div className="min-w-0 text-[13px]"><p className="font-semibold">{details(b)}</p>
                      <p className="text-muted">{[b.travel_date ? formatDate(b.travel_date) : b.request_type, b.vehicle_name, formatDateTime(b.created_at)].filter(Boolean).join(' · ')}</p></div>
                  </div>
                  <div className="mt-3 grid gap-2 xs:grid-cols-2">{statusSelect(b)}{canHaveDriver(b) && driverSelect(b)}</div>
                  <div className="mt-2 flex justify-end gap-1.5">{actions(b)}</div>
                </li>
              );
            })}
          </ul>
          {pages > 1 && (
            <nav aria-label="Pagination" className="mt-5 flex items-center justify-between gap-3">
              <Button variant="secondary" disabled={page === 0 || loading} onClick={() => setPage((p) => p - 1)} icon={<ChevronLeft className="h-4 w-4" aria-hidden />}>Previous</Button>
              <span className="text-sm text-muted">Page {page + 1} of {pages}</span>
              <Button variant="secondary" disabled={page >= pages - 1 || loading} onClick={() => setPage((p) => p + 1)}>Next<ChevronRight className="h-4 w-4" aria-hidden /></Button>
            </nav>
          )}
        </>
      )}

      <Modal open={viewing !== null} onClose={() => setViewing(null)} title={`${viewing?.reference ?? ''} details`}
        footer={<><Button variant="secondary" onClick={() => setViewing(null)}>Close</Button><Button onClick={() => { setEditing(viewing); setViewing(null); }}>Edit</Button></>}>
        {viewing && <dl className="divide-y divide-line text-sm">{detailRows(viewing, driverName(viewing.driver_id)).map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-2.5"><dt className="shrink-0 text-muted">{k}</dt><dd className="min-w-0 whitespace-pre-line break-words text-right font-medium">{v}</dd></div>)}</dl>}
      </Modal>
      {editing && <EditBooking booking={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
      <ConfirmDialog open={deleting !== null} onCancel={() => setDeleting(null)} onConfirm={() => void confirmDelete()} busy={deleteBusy} error={deleteError}
        title={`Delete ${deleting?.reference ?? 'this request'}?`} message="This action cannot be undone. The request and its notification will be permanently removed." />
    </div>
  );
}

function EditBooking({ booking: b, onClose, onSaved }: { booking: Booking; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const apiError = useApiError();
  const isTrip = b.request_type === 'Vehicle Booking';
  const hasRoute = isTrip || b.request_type === 'Instant Ride';
  const [f, setF] = useState({
    customer_name: b.customer_name, phone: b.phone, email: b.email ?? '', pickup: b.pickup ?? '', destination: b.destination ?? '', dropoff: b.dropoff ?? '',
    travel_date: b.travel_date ?? '', travel_time: b.travel_time?.slice(0, 5) ?? '', members: b.members?.toString() ?? '', round_trip: b.round_trip,
    return_date: b.return_date ?? '', return_time: b.return_time?.slice(0, 5) ?? '', vehicle_name: b.vehicle_name ?? '', notes: b.notes ?? '', status: b.status,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const invalid = validateName(f.customer_name) ?? validatePhone(f.phone)
      ?? (isTrip && (!f.pickup.trim() || !f.destination.trim() || !f.travel_date || !f.travel_time || !(Number(f.members) >= 1)) ? 'Pickup, destination, date, time and members are required for a vehicle booking.' : null)
      ?? (isTrip && f.round_trip && (!f.return_date || !f.return_time) ? 'A round trip needs a return date and time.' : null);
    if (invalid) { setError(invalid); return; }
    setBusy(true); setError(null);
    const values: Partial<Booking> = { customer_name: f.customer_name.trim(), phone: f.phone.trim(), email: f.email.trim() || null, notes: f.notes.trim() || null, status: f.status };
    if (hasRoute) Object.assign(values, { pickup: f.pickup.trim() || null, destination: f.destination.trim() || null });
    if (isTrip) Object.assign(values, {
      dropoff: f.dropoff.trim() || null, travel_date: f.travel_date, travel_time: f.travel_time, members: Number(f.members), round_trip: f.round_trip,
      return_date: f.round_trip ? f.return_date : null, return_time: f.round_trip ? f.return_time : null, vehicle_name: f.vehicle_name.trim() || null,
    });
    const { data, error: err } = await supabase.from('bookings').update(values).eq('id', b.id).select('id');
    setBusy(false);
    if (err || !data?.length) { setError(apiError(err ?? { code: '42501' }, 'Could not save. Check the connection and try again.')); return; }
    toast.success('Request updated', b.reference);
    onSaved();
  };

  return (
    <Modal open onClose={onClose} busy={busy} size="lg" title={`Edit ${b.reference}`} description="The reference number and created time cannot be changed.">
      <form onSubmit={save} noValidate className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required><input className="input" value={f.customer_name} maxLength={80} onChange={(e) => set('customer_name', e.target.value)} /></Field>
          <Field label="Phone" required><input className="input" type="tel" value={f.phone} maxLength={20} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Email"><input className="input" type="email" value={f.email} maxLength={160} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Status"><select className="input" value={f.status} onChange={(e) => set('status', e.target.value as BookingStatus)}>{BOOKING_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
          {hasRoute && <Field label="Pickup location" required={isTrip}><input className="input" value={f.pickup} maxLength={160} onChange={(e) => set('pickup', e.target.value)} /></Field>}
          {hasRoute && <Field label="Destination" required={isTrip}><input className="input" value={f.destination} maxLength={160} onChange={(e) => set('destination', e.target.value)} /></Field>}
          {isTrip && (
            <>
              <Field label="Drop-off location" className="sm:col-span-2"><input className="input" value={f.dropoff} maxLength={160} onChange={(e) => set('dropoff', e.target.value)} /></Field>
              <Field label="Pickup date" required><input type="date" className="input" value={f.travel_date} onChange={(e) => set('travel_date', e.target.value)} /></Field>
              <Field label="Pickup time" required><input type="time" className="input" value={f.travel_time} onChange={(e) => set('travel_time', e.target.value)} /></Field>
              <Field label="Members" required><input type="number" min={1} max={500} className="input" value={f.members} onChange={(e) => set('members', e.target.value)} /></Field>
              <Field label="Vehicle" hint="The vehicle agreed with the customer."><input className="input" value={f.vehicle_name} maxLength={80} onChange={(e) => set('vehicle_name', e.target.value)} /></Field>
              <div className="sm:col-span-2"><Toggle checked={f.round_trip} onChange={(v) => set('round_trip', v)} label="Round trip" /></div>
              {f.round_trip && <Field label="Return date" required><input type="date" className="input" value={f.return_date} min={f.travel_date} onChange={(e) => set('return_date', e.target.value)} /></Field>}
              {f.round_trip && <Field label="Return time" required><input type="time" className="input" value={f.return_time} onChange={(e) => set('return_time', e.target.value)} /></Field>}
            </>
          )}
          <Field label="Special requirements / notes" className="sm:col-span-2"><textarea className="input" rows={3} value={f.notes} maxLength={1000} onChange={(e) => set('notes', e.target.value)} /></Field>
        </div>
        <FormError>{error}</FormError>
        <div className="grid grid-cols-2 gap-2.5"><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" loading={busy} loadingText="Saving…">Save</Button></div>
      </form>
    </Modal>
  );
}
