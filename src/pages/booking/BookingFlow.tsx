import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Car, Phone, Search, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { Seo } from '@/components/site/Seo';
import { Stepper } from '@/components/site/Stepper';
import { VehicleCard } from '@/components/site/Parts';
import { Button } from '@/components/ui/Button';
import { Field, FormError } from '@/components/ui/Field';
import { Toggle } from '@/components/ui/Toggle';
import { LocationInput } from '@/components/ui/LocationInput';
import { EmptyState, ImageBox, SkeletonGrid } from '@/components/ui/Feedback';
import { useSiteData } from '@/hooks/useSiteData';
import { useContact } from '@/hooks/useContact';
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey';
import { friendlyError } from '@/lib/errors';
import { publicImageUrl } from '@/lib/supabase';
import { createBooking } from '@/services/public';
import { formatDate, formatTime, todayIST } from '@/utils/format';
import { recommendVehicles } from '@/utils/recommend';
import { validateEmail, validateJourney, validateName, validatePhone, type JourneyErrors } from '@/utils/validation';
import { messageForReceipt } from '@/utils/whatsapp';
import { reserveWhatsAppWindow } from '@/utils/whatsappWindow';
import { AccountError, useCustomer, validatePassword } from '@/customer/auth';
import { EMPTY_DRAFT, rememberReceipt, type BookingDraft } from './draft';

type DetailErrors = Partial<Record<'name' | 'phone' | 'email' | 'password', string | null>>;
interface NavState { draft?: Partial<BookingDraft>; destination?: string; startAt?: number }

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-baseline justify-between gap-4 py-2 text-sm"><dt className="text-muted">{label}</dt><dd className="min-w-0 break-words text-right font-semibold">{value}</dd></div>;
}

export default function BookingFlow() {
  const { vehicles, loading, categoryName } = useSiteData();
  const contact = useContact();
  const customer = useCustomer();
  const signedIn = customer.status === 'signedIn';
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const nav = (location.state ?? {}) as NavState;

  const [draft, setDraft] = useState<BookingDraft>(() => ({
    ...EMPTY_DRAFT, ...nav.draft,
    destination: nav.draft?.destination ?? nav.destination ?? '',
    vehicleId: params.get('vehicle'),
  }));
  const [step, setStep] = useState(() => (nav.startAt === 2 && !Object.keys(validateJourney({ ...EMPTY_DRAFT, ...nav.draft })).length ? 2 : 1));
  const [journeyErrors, setJourneyErrors] = useState<JourneyErrors>({});
  const [detailErrors, setDetailErrors] = useState<DetailErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Passwords are kept out of the booking draft and are only ever handed to Supabase Auth.
  const [credentials, setCredentials] = useState({ password: '', confirm: '' });
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountNotice, setAccountNotice] = useState<ReactNode>(null);
  const [accountError, setAccountError] = useState<ReactNode>(null);
  const [submitting, setSubmitting] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const { keyFor } = useIdempotencyKey();
  const today = todayIST();

  const set = <K extends keyof BookingDraft>(k: K, v: BookingDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const go = (n: number) => { setSubmitError(null); setStep(n); };
  // Move focus to the step heading so keyboard and screen-reader users land in the right place.
  useEffect(() => { window.scrollTo({ top: 0 }); heading.current?.focus(); }, [step]);

  // A signed-in customer never retypes their details: name and phone come from the profile, email from the account.
  const { profile, email: accountEmail } = customer;
  useEffect(() => {
    if (!accountEmail) return;
    setDraft((d) => ({ ...d, email: accountEmail, name: d.name || profile?.full_name || '', phone: d.phone || profile?.phone || '' }));
  }, [accountEmail, profile]);

  const members = Number(draft.members) || 0;
  const rec = useMemo(() => recommendVehicles(vehicles, members), [vehicles, members]);
  const options = useMemo(() => {
    const preselected = vehicles.find((v) => v.id === draft.vehicleId);
    return preselected && !rec.options.some((v) => v.id === preselected.id) ? [preselected, ...rec.options] : rec.options;
  }, [vehicles, rec, draft.vehicleId]);
  const selected = vehicles.find((v) => v.id === draft.vehicleId) ?? null;
  // A vehicle chosen from a link may have been deactivated since; never submit a stale id.
  useEffect(() => { if (!loading && draft.vehicleId && !selected) setDraft((d) => ({ ...d, vehicleId: null })); }, [loading, draft.vehicleId, selected]);

  const submitJourney = (e: FormEvent) => {
    e.preventDefault();
    const errors = validateJourney(draft);
    setJourneyErrors(errors);
    if (!Object.keys(errors).length) go(2);
  };
  const submitDetails = async (e: FormEvent) => {
    e.preventDefault();
    if (accountBusy || customer.status === 'loading') return;
    const errors: DetailErrors = {
      name: validateName(draft.name), phone: validatePhone(draft.phone), email: validateEmail(draft.email, true),
      password: signedIn ? null : validatePassword(credentials.password, credentials.confirm),
    };
    setDetailErrors(errors);
    if (Object.values(errors).some(Boolean)) return;
    if (signedIn) { go(3); return; }
    // Not signed in: sign in to the existing account, or create one. An existing account is never
    // overwritten and never duplicated; a wrong password stops here with a sign-in / reset path.
    setAccountBusy(true); setAccountError(null); setAccountNotice(null);
    try {
      const result = await customer.ensureAccount({ fullName: draft.name, email: draft.email, phone: draft.phone, password: credentials.password });
      if (result === 'signedIn') { setCredentials({ password: '', confirm: '' }); go(3); }
      else setAccountNotice(<>We sent a confirmation link to <strong>{draft.email.trim()}</strong>. Open it, then come back to this page and press <strong>Find a Vehicle</strong> again — your journey details are kept here.</>);
    } catch (err) {
      setAccountError(err instanceof AccountError && err.code === 'exists'
        ? <>An account with this email already exists, but that password does not match it. Enter the correct password, or <Link to="/forgot-password" className="link">reset your password</Link>.</>
        : err instanceof AccountError ? err.message : 'Something went wrong. Please try again.');
    } finally { setAccountBusy(false); }
  };
  const submitBooking = async () => {
    if (submitting) return;
    if (!signedIn) { go(2); return; }   // session ended mid-flow: sign in again rather than book without an owner
    setSubmitting(true); setSubmitError(null);
    // Reserve the WhatsApp tab now, while the click is still a user gesture. The booking is saved exactly once below.
    const reserved = reserveWhatsAppWindow(contact.hasWhatsApp);
    const base = {
      request_type: 'Vehicle Booking' as const,
      name: draft.name.trim(), phone: draft.phone.trim(), email: draft.email.trim(),
      pickup: draft.pickup.trim(), destination: draft.destination.trim(), dropoff: draft.dropoff.trim(),
      travel_date: draft.date, travel_time: draft.time, members: draft.members,
      round_trip: draft.roundTrip, return_date: draft.roundTrip ? draft.returnDate : '', return_time: draft.roundTrip ? draft.returnTime : '',
      ac_preferred: draft.acPreferred, flexible_time: draft.flexibleTime, notes: draft.notes.trim(), vehicle_id: selected?.id ?? null,
    };
    try {
      const receipt = await createBooking({ ...base, idempotency_key: keyFor(base) });
      rememberReceipt(receipt);
      // WhatsApp is opened from the authoritative receipt. Whatever happens here, the booking stands.
      const whatsapp = reserved.open(contact.whatsappUrl(messageForReceipt(receipt)));
      navigate('/booking/confirmation', { replace: true, state: { receipt, whatsapp } });
    } catch (err) {
      reserved.cancel();
      // No success screen is ever shown unless the database returned a reference.
      setSubmitError(friendlyError(err, 'Unable to submit your booking. Please try again.'));
      setSubmitting(false);
    }
  };

  const titles = ['Journey Details', 'Travel Details', 'Vehicle Recommendation', 'Review Your Request'];
  const intros = ['Start with the essential route and schedule.', 'Tell us who is travelling and anything that helps the team review your request.',
    'Suitable options based on the journey details you provided.', 'Check the journey before sending it for review.'];

  return (
    <div className="container-page max-w-4xl py-8 sm:py-12">
      <Seo title="Book a Vehicle" description="Send a vehicle booking request in a few steps. Our office confirms availability with you directly." />
      <Stepper current={step} />
      <h1 ref={heading} tabIndex={-1} className="text-[28px] leading-tight outline-none sm:text-4xl">{step === 3 && loading ? 'Finding suitable vehicles' : titles[step - 1]}</h1>
      <p className="mb-6 mt-2 text-[15px] text-muted">{intros[step - 1]}</p>

      {step === 1 && (
        <form onSubmit={submitJourney} noValidate>
          <div className="card grid gap-4 p-4 sm:grid-cols-2 sm:gap-5 sm:p-6">
            <Field label="Pickup" required error={journeyErrors.pickup}><LocationInput value={draft.pickup} onChange={(v) => set('pickup', v)} placeholder="Enter pickup location" /></Field>
            <Field label="Destination" required error={journeyErrors.destination} hint="Type a town, city or landmark"><LocationInput value={draft.destination} onChange={(v) => set('destination', v)} placeholder="Enter destination" /></Field>
            <Field label="Drop-off" className="sm:col-span-2"><input className="input" value={draft.dropoff} onChange={(e) => set('dropoff', e.target.value)} placeholder="Optional drop-off details" maxLength={160} /></Field>
            <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3 sm:gap-5">
              <Field label="Travel date" required error={journeyErrors.date}><input type="date" className="input" min={today} value={draft.date} onChange={(e) => set('date', e.target.value)} /></Field>
              <Field label="Travel time" required error={journeyErrors.time}><input type="time" className="input" value={draft.time} onChange={(e) => set('time', e.target.value)} /></Field>
              <Field label="Number of members" required error={journeyErrors.members}><input type="number" inputMode="numeric" min={1} max={500} className="input" value={draft.members} onChange={(e) => set('members', e.target.value)} placeholder="Enter passengers" /></Field>
            </div>
            <div className="sm:col-span-2"><Toggle checked={draft.roundTrip} onChange={(v) => set('roundTrip', v)} label="Round trip" /></div>
            {draft.roundTrip && (
              <>
                <Field label="Return date" required error={journeyErrors.returnDate}><input type="date" className="input" min={draft.date || today} value={draft.returnDate} onChange={(e) => set('returnDate', e.target.value)} /></Field>
                <Field label="Return time" required error={journeyErrors.returnTime}><input type="time" className="input" value={draft.returnTime} onChange={(e) => set('returnTime', e.target.value)} /></Field>
              </>
            )}
          </div>
          <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-between">
            <Link to="/" className="btn-ghost">Back to Home</Link>
            <Button type="submit">Continue to Details</Button>
          </div>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={submitDetails} noValidate>
          <div className="card flex flex-col gap-5 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3 rounded-md bg-info-soft px-4 py-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-info">Journey</p>
                <p className="truncate text-sm font-semibold">{draft.pickup} → {draft.destination}</p>
                <p className="text-[13px] text-muted">{formatDate(draft.date)}, {formatTime(draft.time)} · {draft.members} {Number(draft.members) === 1 ? 'member' : 'members'}</p>
              </div>
              <button type="button" onClick={() => go(1)} className="link min-h-11 shrink-0 text-sm">Edit journey</button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
              <Field label="Full name" required error={detailErrors.name}><input className="input" value={draft.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" maxLength={80} placeholder="Your name" /></Field>
              <Field label="Phone number" required error={detailErrors.phone} hint="We will call or WhatsApp this number."><input className="input" type="tel" inputMode="tel" value={draft.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" maxLength={20} placeholder="Phone number" /></Field>
              {signedIn ? (
                <Field label="Email" className="sm:col-span-2" hint="From your account. Updates about this booking appear in My account.">
                  <input className="input" type="email" value={draft.email} readOnly disabled />
                </Field>
              ) : (
                <>
                  <Field label="Email" required error={detailErrors.email} className="sm:col-span-2" hint="Your account login. Already registered? Use the same email and password.">
                    <input className="input" type="email" value={draft.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" maxLength={160} placeholder="you@example.com" />
                  </Field>
                  <Field label="Password" required error={detailErrors.password} hint="At least 8 characters.">
                    <input className="input" type="password" value={credentials.password} onChange={(e) => setCredentials((c) => ({ ...c, password: e.target.value }))} autoComplete="new-password" />
                  </Field>
                  <Field label="Confirm password" required>
                    <input className="input" type="password" value={credentials.confirm} onChange={(e) => setCredentials((c) => ({ ...c, confirm: e.target.value }))} autoComplete="new-password" />
                  </Field>
                </>
              )}
            </div>
            {!signedIn && <p className="-mt-2 text-[13px] text-muted">Booking creates your account so you can follow this request. <Link to="/login" state={{ from: '/book' }} className="link">Login instead</Link></p>}
            {accountNotice && <p role="status" className="rounded-md border border-success/40 bg-success-soft px-3.5 py-3 text-sm">{accountNotice}</p>}
            <FormError>{accountError}</FormError>
            <Field label="Notes"><textarea className="input" rows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} maxLength={1000} placeholder="Add luggage, accessibility or journey notes (optional)" /></Field>
            <div className="flex flex-wrap gap-x-8 gap-y-1">
              <Toggle checked={draft.acPreferred} onChange={(v) => set('acPreferred', v)} label="AC preferred" />
              <Toggle checked={draft.flexibleTime} onChange={(v) => set('flexibleTime', v)} label="Flexible departure time" />
            </div>
            <p className="flex items-start gap-2.5 rounded-md bg-sunken px-4 py-3 text-[13px] text-muted"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />Only share information needed to arrange this journey. Final availability is confirmed after review.</p>
          </div>
          <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-between">
            <Button variant="secondary" onClick={() => go(1)}>Back</Button>
            <Button type="submit" loading={accountBusy} loadingText="Checking account…" disabled={customer.status === 'loading'} icon={<Search className="h-4 w-4" aria-hidden />}>Find a Vehicle</Button>
          </div>
        </form>
      )}

      {step === 3 && (
        <div>
          {loading ? <SkeletonGrid count={2} className="grid gap-5 sm:grid-cols-2" /> : options.length ? (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                {options.map((v) => (
                  <VehicleCard key={v.id} vehicle={v} selected={draft.vehicleId === v.id} note={rec.note && rec.options[0]?.id === v.id ? rec.note : null}
                    onSelect={() => set('vehicleId', draft.vehicleId === v.id ? null : v.id)} />
                ))}
              </div>
              <label className={`card mt-5 flex min-h-11 cursor-pointer items-center gap-3 p-4 ${draft.vehicleId === null ? 'border-accent ring-2 ring-accent/30' : ''}`}>
                <input type="radio" name="vehicle-choice" className="h-4 w-4 accent-[rgb(var(--accent))]" checked={draft.vehicleId === null} onChange={() => set('vehicleId', null)} />
                <UserRoundCheck className="h-5 w-5 shrink-0 text-accent-text" aria-hidden />
                <span className="text-sm"><span className="block font-semibold">Not sure? Let our team recommend</span><span className="text-muted">We will suggest a vehicle when we call you.</span></span>
              </label>
              <p className="mt-4 text-right text-[13px] text-muted">Details and availability are confirmed on enquiry.</p>
            </>
          ) : (
            <EmptyState icon={<Car className="h-6 w-6" aria-hidden />} title="No suitable vehicle found"
              body="This is not a failed booking. You can still send your request and our team will arrange a vehicle, or change your number of passengers."
              action={contact.telHref ? <a href={contact.telHref} className="btn-secondary"><Phone className="h-4 w-4" aria-hidden />Contact Us</a> : undefined} />
          )}
          <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-between">
            <Button variant="secondary" onClick={() => go(2)}>Back to details</Button>
            <Button onClick={() => go(4)} disabled={loading}>{options.length ? 'Review Request' : 'Continue without a vehicle'}</Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
            <section className="card p-4 sm:p-6" aria-labelledby="summary-heading">
              <div className="mb-1 flex items-center justify-between">
                <h2 id="summary-heading" className="text-base">Journey summary</h2>
                <button type="button" onClick={() => go(1)} className="link min-h-11 text-sm">Edit</button>
              </div>
              <dl className="divide-y divide-line">
                <SummaryRow label="Name" value={draft.name} />
                <SummaryRow label="Phone" value={draft.phone} />
                <SummaryRow label="Email" value={draft.email} />
                <SummaryRow label="Pickup" value={draft.pickup} />
                <SummaryRow label="Destination" value={draft.destination} />
                {draft.dropoff && <SummaryRow label="Drop-off" value={draft.dropoff} />}
                <SummaryRow label="Date" value={formatDate(draft.date)} />
                <SummaryRow label="Time" value={`${formatTime(draft.time)}${draft.flexibleTime ? ' (flexible)' : ''}`} />
                <SummaryRow label="Passengers" value={draft.members} />
                <SummaryRow label="Round trip" value={draft.roundTrip ? `Yes — returns ${formatDate(draft.returnDate)}, ${formatTime(draft.returnTime)}` : 'No'} />
                <SummaryRow label="AC preferred" value={draft.acPreferred ? 'Yes' : 'No'} />
                {draft.notes && <SummaryRow label="Notes" value={draft.notes} />}
                <SummaryRow label="Status after submission" value="Pending" />
              </dl>
            </section>
            <section className="card self-start overflow-hidden" aria-label="Selected vehicle">
              <ImageBox src={publicImageUrl('vehicle-images', selected?.image_path)} alt={selected?.name ?? ''} placeholder={selected ? categoryName(selected.category_id) || 'Vehicle' : 'Vehicle to be recommended'} />
              <div className="p-4">
                <h2 className="text-base">{selected?.name ?? 'Our team will recommend a vehicle'}</h2>
                <p className="mt-1 text-[13px] text-muted">{selected ? `${selected.capacity} seater · ${selected.has_ac ? 'AC' : 'Non-AC'} · ${selected.price_label || 'Available on enquiry'}` : 'Based on your group size and journey.'}</p>
                <button type="button" onClick={() => go(3)} className="link mt-1 min-h-11 text-sm">Change</button>
              </div>
            </section>
          </div>
          <div className="mt-5"><FormError>{submitError}</FormError></div>
          <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-between">
            <Button variant="secondary" onClick={() => go(3)} disabled={submitting}>Back</Button>
            <Button onClick={submitBooking} loading={submitting} loadingText="Submitting…">{submitError ? 'Try Again' : 'Submit Booking Request'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
