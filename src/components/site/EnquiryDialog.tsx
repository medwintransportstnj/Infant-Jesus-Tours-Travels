import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, FormError } from '@/components/ui/Field';
import { friendlyError } from '@/lib/errors';
import { createBooking } from '@/services/public';
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey';
import { validateName, validatePhone } from '@/utils/validation';
import { useContact } from '@/hooks/useContact';
import { useCustomer } from '@/customer/auth';
import { messageForReceipt } from '@/utils/whatsapp';
import { reserveWhatsAppWindow } from '@/utils/whatsappWindow';
import { ReceiptActions, ReceiptCard, WhatsAppNotice } from './Receipt';
import type { BookingReceipt, WhatsAppLaunch } from '@/types/db';

export interface EnquirySubject { kind: 'offer' | 'package'; id: string; title: string }

/** Name + phone enquiry about an offer or package. Saved to Supabase first, then handed to WhatsApp. */
export function EnquiryDialog({ subject, onClose }: { subject: EnquirySubject | null; onClose: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<{ name?: string | null; phone?: string | null }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<BookingReceipt | null>(null);
  const [launch, setLaunch] = useState<WhatsAppLaunch>();
  const { keyFor, reset } = useIdempotencyKey();
  const contact = useContact();
  const { profile, email } = useCustomer();

  useEffect(() => { if (subject) { setReceipt(null); setLaunch(undefined); setFormError(null); setErrors({}); reset(); } }, [subject, reset]);
  useEffect(() => { if (profile) { setName((v) => v || profile.full_name); setPhone((v) => v || profile.phone); } }, [profile]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!subject || busy) return;
    const next = { name: validateName(name), phone: validatePhone(phone) };
    setErrors(next);
    if (next.name || next.phone) return;
    setBusy(true); setFormError(null);
    const reserved = reserveWhatsAppWindow(contact.hasWhatsApp);   // inside the click, before any await
    try {
      const base = {
        request_type: subject.kind === 'offer' ? 'Offer Enquiry' as const : 'Package Enquiry' as const,
        name: name.trim(), phone: phone.trim(), email: email ?? '',
        ...(subject.kind === 'offer' ? { offer_id: subject.id } : { package_id: subject.id }),
      };
      const saved = await createBooking({ ...base, idempotency_key: keyFor(base) });
      setLaunch(reserved.open(contact.whatsappUrl(messageForReceipt(saved))));
      setReceipt(saved);
    } catch (err) {
      reserved.cancel();
      setFormError(friendlyError(err, 'Unable to send your enquiry. Please try again.'));
    } finally { setBusy(false); }
  };

  return (
    <Modal open={Boolean(subject)} onClose={onClose} busy={busy}
      title={receipt ? 'Enquiry received' : `Enquire: ${subject?.title ?? ''}`}
      description={receipt ? undefined : 'Leave your name and number. WhatsApp then opens with your enquiry ready to send.'}>
      {receipt ? (
        <div className="flex flex-col gap-4">
          <WhatsAppNotice launch={launch} receipt={receipt} />
          <ReceiptCard receipt={receipt} compact />
          <ReceiptActions receipt={receipt} stacked />
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field label="Full name" required error={errors.name}>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} placeholder="Your name" />
          </Field>
          <Field label="Phone number" required error={errors.phone}>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" maxLength={20} placeholder="Phone number" />
          </Field>
          <FormError>{formError}</FormError>
          <Button type="submit" loading={busy} loadingText="Sending…" block>Send Enquiry</Button>
        </form>
      )}
    </Modal>
  );
}
