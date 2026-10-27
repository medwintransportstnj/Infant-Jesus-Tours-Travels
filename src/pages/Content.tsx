import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Images, Mail, MapPin, MapPinned, MessageCircle, Phone, Send, Ticket, X } from 'lucide-react';
import { Seo } from '@/components/site/Seo';
import { DestinationCard, PageHeader } from '@/components/site/Parts';
import { EnquiryDialog, type EnquirySubject } from '@/components/site/EnquiryDialog';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, FormError } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { EmptyState, ErrorState, ImageBox, SkeletonGrid } from '@/components/ui/Feedback';
import { useSiteData } from '@/hooks/useSiteData';
import { useContact } from '@/hooks/useContact';
import { friendlyError } from '@/lib/errors';
import { publicImageUrl } from '@/lib/supabase';
import { createContactMessage } from '@/services/public';
import { daysLeft, formatDate } from '@/utils/format';
import { validateEmail, validateName, validatePhone } from '@/utils/validation';

export function Destinations() {
  const { destinations, loading, error, reload } = useSiteData();
  return (
    <div className="container-page py-8 sm:py-12">
      <Seo title="Destinations" description="Popular destinations for pilgrimage, family and customized travel." />
      <PageHeader title="Destinations" intro="Places our travellers ask for most. Don't see yours? We plan journeys anywhere." />
      {loading ? <SkeletonGrid count={6} /> : error && !destinations.length ? <ErrorState message={error} onRetry={reload} /> : destinations.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{destinations.map((d) => <DestinationCard key={d.id} destination={d} />)}</div>
      ) : (
        <EmptyState icon={<MapPinned className="h-6 w-6" aria-hidden />} title="Destinations are coming soon" body="Tell us where you want to go and we will arrange the journey."
          action={<Link to="/book" className="btn-primary">Plan a Journey</Link>} />
      )}
    </div>
  );
}

export function Offers() {
  const { offers, loading, error, reload } = useSiteData();
  const [enquiry, setEnquiry] = useState<EnquirySubject | null>(null);
  return (
    <div className="container-page py-8 sm:py-12">
      <Seo title="Offers" description="Current offers from Infant Jesus Tours & Travels." />
      <PageHeader title="Offers" intro="Current offers. Each one lists the date it ends." />
      {loading ? <SkeletonGrid count={2} className="grid gap-5 lg:grid-cols-2" /> : error && !offers.length ? <ErrorState message={error} onRetry={reload} /> : offers.length ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {offers.map((o) => {
            const left = daysLeft(o.expires_on);
            return (
              <article key={o.id} className="card flex flex-col p-5 sm:p-6">
                <div><Badge tone="accent">{left} {left === 1 ? 'day' : 'days'} left</Badge></div>
                <h2 className="mt-3 text-xl">{o.title}</h2>
                {o.description && <p className="mt-1.5 text-sm text-muted">{o.description}</p>}
                <p className="mt-2 text-[13px] text-muted">Valid until {formatDate(o.expires_on)}</p>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  <Link to="/book" className="btn-primary">Book Now</Link>
                  <Button variant="secondary" onClick={() => setEnquiry({ kind: 'offer', id: o.id, title: o.title })} icon={<MessageCircle className="h-4 w-4" aria-hidden />}>Enquire on WhatsApp</Button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={<Ticket className="h-6 w-6" aria-hidden />} title="No offers available" body="There are currently no active offers."
          action={<Link to="/vehicles" className="btn-secondary">Explore Vehicles</Link>} />
      )}
      <EnquiryDialog subject={enquiry} onClose={() => setEnquiry(null)} />
    </div>
  );
}

export function Gallery() {
  const data = useSiteData();
  const items = data.gallery('gallery');
  const intro = data.page('gallery');
  const [active, setActive] = useState<number | null>(null);
  const close = useCallback(() => setActive(null), []);
  const step = useCallback((d: number) => setActive((i) => (i === null ? i : (i + d + items.length) % items.length)), [items.length]);

  useEffect(() => {
    if (active === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [active, close, step]);

  const current = active !== null ? items[active] : null;
  return (
    <div className="container-page py-8 sm:py-12">
      <Seo title="Gallery" description="Photographs from journeys with our travellers." />
      <PageHeader title={intro?.heading || 'Gallery'} intro={intro?.body} />
      {data.loading ? <SkeletonGrid count={8} className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4" /> : data.error && !items.length ? <ErrorState message={data.error} onRetry={data.reload} /> : items.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {items.map((g, i) => (
            <li key={g.id}>
              <button type="button" onClick={() => setActive(i)} className="group relative block w-full overflow-hidden rounded-lg border border-line text-left" aria-label={`Open photo${g.caption ? `: ${g.caption}` : ` ${i + 1}`}`}>
                <ImageBox src={publicImageUrl('gallery-images', g.image_path)} alt={g.caption} opacity={g.opacity} ratio="aspect-[4/3]" />
                {g.caption && <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2.5 pt-8 text-xs font-semibold text-white">{g.caption}</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : <EmptyState icon={<Images className="h-6 w-6" aria-hidden />} title="Photos are coming soon" body="Photographs from recent journeys will be added here." />}

      {current && (
        <div role="dialog" aria-modal="true" aria-label="Photo viewer" className="fixed inset-0 z-[100] flex animate-fade-in flex-col bg-inverse/95 p-3 sm:p-6" onClick={close}>
          <div className="flex justify-end">
            <button type="button" autoFocus onClick={close} aria-label="Close photo viewer" className="grid h-11 w-11 place-items-center rounded-md text-white hover:bg-white/10"><X className="h-5 w-5" aria-hidden /></button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
            {items.length > 1 && <button type="button" onClick={() => step(-1)} aria-label="Previous photo" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"><ChevronLeft className="h-5 w-5" aria-hidden /></button>}
            <img src={publicImageUrl('gallery-images', current.image_path) ?? ''} alt={current.caption} className="max-h-full min-w-0 max-w-full rounded-lg object-contain" />
            {items.length > 1 && <button type="button" onClick={() => step(1)} aria-label="Next photo" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"><ChevronRight className="h-5 w-5" aria-hidden /></button>}
          </div>
          <p className="pt-3 text-center text-sm text-white/80" aria-live="polite">{current.caption || 'Photo'} · {active! + 1} of {items.length}</p>
        </div>
      )}
    </div>
  );
}

export function About() {
  const data = useSiteData();
  const contact = useContact();
  const about = data.page('about');
  return (
    <div className="container-page py-8 sm:py-12">
      <Seo title="About" description={about?.body?.slice(0, 160)} />
      <PageHeader title="About" />
      <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-12">
        <ImageBox src={publicImageUrl('logos', data.settings?.logo_secondary_path)} alt={contact.companyName} placeholder="Team photo" ratio="aspect-[4/3]" rounded="rounded-xl" className="border border-line" eager />
        <div>
          <h2 className="text-2xl sm:text-3xl">{about?.heading || 'Travel With Confidence'}</h2>
          {about?.body && <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-muted">{about.body}</p>}
          <ul className="mt-5 space-y-2.5">
            {['Family-friendly planning', 'Corporate travel enquiries', 'Pilgrimage and customized journeys', 'Round-trip and one-way options'].map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-sm"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success-soft text-success"><Check className="h-3 w-3" aria-hidden /></span>{t}</li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link to="/book" className="btn-primary">Book a Vehicle</Link>
            <Link to="/contact" className="btn-secondary">Contact Us</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Contact() {
  const data = useSiteData();
  const contact = useContact();
  const toast = useToast();
  const [f, setF] = useState({ name: '', email: '', phone: '', message: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof f, string | null>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof f, v: string) => { setF((p) => ({ ...p, [k]: v })); setSent(false); };
  const wa = contact.whatsappUrl();
  const mapUrl = data.settings?.map_embed_url;
  const intro = data.page('contact');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const next = {
      name: validateName(f.name), email: validateEmail(f.email, true),
      phone: f.phone.trim() ? validatePhone(f.phone) : null,
      message: f.message.trim().length >= 2 ? null : 'Please enter your message.',
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setBusy(true); setFormError(null);
    try {
      await createContactMessage({ name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), message: f.message.trim() });
      setF({ name: '', email: '', phone: '', message: '' });
      setSent(true);
      toast.success('Message sent', "We'll get back to you soon.");
    } catch (err) {
      setFormError(friendlyError(err, 'Unable to send your message. Please try again.'));
    } finally { setBusy(false); }
  };

  return (
    <div className="container-page py-8 sm:py-12">
      <Seo title="Contact" description="Call, WhatsApp or send a message to Infant Jesus Tours & Travels." />
      <PageHeader title="Contact" intro={intro?.body} />
      <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
        <form onSubmit={submit} noValidate className="card flex flex-col gap-4 self-start p-4 sm:p-6">
          <Field label="Name" required error={errors.name}><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" maxLength={80} placeholder="Enter your name" /></Field>
          <Field label="Email" required error={errors.email}><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" maxLength={160} placeholder="Enter email" /></Field>
          <Field label="Phone" error={errors.phone}><input className="input" type="tel" inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" maxLength={20} placeholder="Optional" /></Field>
          <Field label="Message" required error={errors.message}><textarea className="input" rows={4} value={f.message} onChange={(e) => set('message', e.target.value)} maxLength={2000} placeholder="How can we help?" /></Field>
          <FormError>{formError}</FormError>
          {sent && <p role="status" className="flex items-center gap-2 rounded-md border border-success/40 bg-success-soft px-3.5 py-3 text-sm font-medium text-success"><Check className="h-4 w-4" aria-hidden />Message sent — we'll get back to you soon.</p>}
          <Button type="submit" loading={busy} loadingText="Sending…" className="self-start" icon={<Send className="h-4 w-4" aria-hidden />}>Send Message</Button>
        </form>
        <div className="flex flex-col gap-5">
          <div className="min-h-[280px] overflow-hidden rounded-lg border border-line bg-sunken">
            {mapUrl ? <iframe title="Office location map" src={mapUrl} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" className="h-full min-h-[280px] w-full border-0" allowFullScreen />
              : <div className="grid h-full min-h-[280px] place-items-center px-4 text-center text-sm text-muted">Map will appear here once the office location is set.</div>}
          </div>
          <ul className="space-y-3 text-sm">
            {contact.address && <li className="flex gap-3"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" aria-hidden /><span>{contact.address}</span></li>}
            {contact.telHref && <li className="flex gap-3"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" aria-hidden /><a href={contact.telHref} className="hover:underline">{contact.phone}</a></li>}
            {contact.email && <li className="flex gap-3"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" aria-hidden /><a href={`mailto:${contact.email}`} className="break-all hover:underline">{contact.email}</a></li>}
            {wa && <li className="flex gap-3"><MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" aria-hidden /><a href={wa} target="_blank" rel="noopener noreferrer" className="hover:underline">Chat on WhatsApp</a></li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="container-page py-16">
      <Seo title="Page not found" noindex />
      <EmptyState title="We couldn't find that page" body="The link may be out of date. Head back home or start a booking."
        action={<><Link to="/" className="btn-primary">Back to Home</Link><Link to="/book" className="btn-secondary">Book a Vehicle</Link></>} />
    </div>
  );
}
