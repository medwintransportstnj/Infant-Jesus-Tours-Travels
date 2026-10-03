import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Zap } from 'lucide-react';
import { Seo } from '@/components/site/Seo';
import { PageHeader } from '@/components/site/Parts';
import { Button } from '@/components/ui/Button';
import { Field, FormError } from '@/components/ui/Field';
import { LocationInput } from '@/components/ui/LocationInput';
import { useContact } from '@/hooks/useContact';
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey';
import { friendlyError } from '@/lib/errors';
import { createBooking } from '@/services/public';
import { validateName, validatePhone } from '@/utils/validation';
import { messageForReceipt } from '@/utils/whatsapp';
import { reserveWhatsAppWindow } from '@/utils/whatsappWindow';
import { useCustomer } from '@/customer/auth';
import { rememberReceipt } from './booking/draft';

export default function InstantRide() {
  const contact = useContact();
  const customer = useCustomer();
  const navigate = useNavigate();
  const { keyFor } = useIdempotencyKey();
  const [f, setF] = useState({ name: '', phone: '', pickup: '', destination: '', notes: '' });
  const [errors, setErrors] = useState<{ name?: string | null; phone?: string | null }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const wa = contact.whatsappUrl('Hi, I need an instant ride.');
  // Signed-in customers do not retype their details.
  const { profile } = customer;
  useEffect(() => { if (profile) setF((p) => ({ ...p, name: p.name || profile.full_name, phone: p.phone || profile.phone })); }, [profile]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const next = { name: validateName(f.name), phone: validatePhone(f.phone) };
    setErrors(next);
    if (next.name || next.phone) return;
    setBusy(true); setFormError(null);
    const reserved = reserveWhatsAppWindow(contact.hasWhatsApp);   // must happen inside the click, before any await
    const base = { request_type: 'Instant Ride' as const, name: f.name.trim(), phone: f.phone.trim(), email: customer.email ?? '', pickup: f.pickup.trim(), destination: f.destination.trim(), notes: f.notes.trim() };
    try {
      const receipt = await createBooking({ ...base, idempotency_key: keyFor(base) });
      rememberReceipt(receipt);
      const whatsapp = reserved.open(contact.whatsappUrl(messageForReceipt(receipt)));
      navigate('/booking/confirmation', { state: { receipt, whatsapp } });
    } catch (err) {
      reserved.cancel();
      setFormError(friendlyError(err, 'Unable to send your request. Please try again or call us.'));
      setBusy(false);
    }
  };

  return (
    <div className="container-page py-8 sm:py-12">
      <Seo title="Instant Ride" description="Need a ride now? Send a quick request and our office will follow up right away." />
      <PageHeader title="Need a Ride Now?" intro="Leave your name and number — add a pickup point if you know it. Our office will call you back." />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <form onSubmit={submit} noValidate className="card flex flex-col gap-4 p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required error={errors.name}><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" maxLength={80} placeholder="Your name" /></Field>
            <Field label="Phone" required error={errors.phone}><input className="input" type="tel" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" maxLength={20} placeholder="Phone number" /></Field>
          </div>
          <Field label="Pickup"><LocationInput value={f.pickup} onChange={(v) => set('pickup', v)} placeholder="Enter pickup (optional)" /></Field>
          <Field label="Destination"><LocationInput value={f.destination} onChange={(v) => set('destination', v)} placeholder="Enter destination (optional)" /></Field>
          <Field label="Note"><input className="input" value={f.notes} onChange={(e) => set('notes', e.target.value)} maxLength={300} placeholder="Add a useful note (optional)" /></Field>
          <FormError>{formError}</FormError>
          <Button type="submit" loading={busy} loadingText="Sending request…" block icon={<Zap className="h-4 w-4" aria-hidden />}>Request Instant Ride</Button>
        </form>
        <aside className="self-start">
          <span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-accent-soft text-accent-text"><Zap className="h-5 w-5" aria-hidden /></span>
          <h2 className="text-xl">A quick request, calmly handled</h2>
          <p className="mt-2 text-sm text-muted">Submitting the form records a request with a reference number. It does not imply vehicle availability until the team follows up.</p>
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-secondary mt-4"><MessageCircle className="h-4 w-4" aria-hidden />WhatsApp</a>}
        </aside>
      </div>
    </div>
  );
}
