import { useState } from 'react';
import { AlertCircle, CheckCircle2, Download, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { useContact } from '@/hooks/useContact';
import { createdParts, formatDate, formatTime } from '@/utils/format';
import { downloadReferenceImage } from '@/utils/referenceImage';
import { messageForReceipt } from '@/utils/whatsapp';
import type { BookingReceipt, WhatsAppLaunch } from '@/types/db';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right font-semibold text-ink">{value}</dd>
    </div>
  );
}

/** The server-issued receipt: reference, status and what was requested. */
export function ReceiptCard({ receipt, compact = false }: { receipt: BookingReceipt; compact?: boolean }) {
  const c = createdParts(receipt.created_at);
  const isBooking = receipt.request_type === 'Vehicle Booking';
  return (
    <section aria-label="Booking reference" className="rounded-lg border border-success/40 bg-success-soft p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-card text-success"><CheckCircle2 className="h-5 w-5" aria-hidden /></span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-success">{isBooking ? 'Booking reference' : 'Request reference'}</p>
            <p className="text-3xl font-bold tracking-tight text-ink">{receipt.reference}</p>
          </div>
        </div>
        <StatusBadge status={receipt.status} prefix="Status: " />
      </div>
      <p className="mt-4 text-[13px] text-ink/75">
        This confirms we received your request — not final vehicle availability. Our office will review the details and contact you.
      </p>
      <dl className={`mt-3 grid gap-x-8 border-t border-success/20 pt-3 ${compact ? '' : 'sm:grid-cols-2'}`}>
        {isBooking && <Row label="Journey" value={`${receipt.pickup} → ${receipt.destination}`} />}
        {isBooking && <Row label="Date" value={formatDate(receipt.travel_date)} />}
        {isBooking && <Row label="Time" value={`${formatTime(receipt.travel_time)}${receipt.flexible_time ? ' (flexible)' : ''}`} />}
        {isBooking && <Row label="Passengers" value={String(receipt.members ?? '—')} />}
        {isBooking && <Row label="Vehicle" value={receipt.vehicle_name || 'To be recommended'} />}
        {isBooking && receipt.round_trip && <Row label="Return" value={`${formatDate(receipt.return_date)}, ${formatTime(receipt.return_time)}`} />}
        {!isBooking && <Row label="Request" value={receipt.request_type} />}
        {receipt.subject_title && <Row label="About" value={receipt.subject_title} />}
        {!isBooking && receipt.pickup && <Row label="Pickup" value={receipt.pickup} />}
        {!isBooking && receipt.destination && <Row label="Destination" value={receipt.destination} />}
        <Row label="Name" value={receipt.customer_name} />
        <Row label="Requested" value={`${c.date}, ${c.time}`} />
      </dl>
    </section>
  );
}

/** Download-as-image + Send-via-WhatsApp. WhatsApp is a real link the customer taps, so pop-up blockers never interfere. */
export function ReceiptActions({ receipt, stacked = false }: { receipt: BookingReceipt; stacked?: boolean }) {
  const contact = useContact();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const wa = contact.whatsappUrl(messageForReceipt(receipt));
  const download = () => {
    setBusy(true);
    try { downloadReferenceImage(receipt, { name: contact.companyName, phone: contact.phone }); }
    catch (err) { console.error('[ijt] reference image failed', err); toast.error('Could not create the image', `Please note your reference: ${receipt.reference}`); }
    finally { setBusy(false); }
  };
  return (
    <div className={`flex gap-2.5 ${stacked ? 'flex-col' : 'flex-col sm:flex-row'}`}>
      <Button variant="secondary" onClick={download} loading={busy} icon={<Download className="h-4 w-4" aria-hidden />}>Download Booking Reference</Button>
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-primary">
          <MessageCircle className="h-4 w-4" aria-hidden />Send via WhatsApp
        </a>
      )}
    </div>
  );
}

/**
 * Tells the customer what happened with the automatic WhatsApp hand-off. The request itself is already
 * saved in every case — this never reports a booking problem, and never claims a message was sent
 * (WhatsApp only opens with the text prefilled; the customer presses Send).
 */
export function WhatsAppNotice({ launch, receipt }: { launch: WhatsAppLaunch | undefined; receipt: BookingReceipt }) {
  const contact = useContact();
  const wa = contact.whatsappUrl(messageForReceipt(receipt));
  if (!launch) return null;
  if (launch === 'opened') {
    return (
      <p role="status" className="flex items-start gap-2.5 rounded-md border border-success/40 bg-success-soft px-3.5 py-3 text-sm text-ink">
        <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
        <span>WhatsApp has been opened with your details filled in. <strong>Press Send there</strong> to share them with our office.</span>
      </p>
    );
  }
  if (launch === 'blocked' && wa) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-md border border-warning/40 bg-warning-soft px-3.5 py-3 text-sm text-ink sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-start gap-2.5"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />Your booking was received, but WhatsApp could not be opened automatically. Please use the Open WhatsApp button.</span>
        <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-primary shrink-0"><MessageCircle className="h-4 w-4" aria-hidden />Open WhatsApp</a>
      </div>
    );
  }
  return (
    <p role="status" className="flex items-start gap-2.5 rounded-md border border-line bg-surface px-3.5 py-3 text-sm text-ink">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
      <span>Your request is saved. WhatsApp is not available right now — our office will contact you{contact.phone ? <>, or you can call <a className="link" href={contact.telHref ?? undefined}>{contact.phone}</a></> : ''}.</span>
    </p>
  );
}
