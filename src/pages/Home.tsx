import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarCheck, Check, Mail, Map, MapPin, MessageCircle, MessageSquareDashed, Phone, Search, Star, Ticket, Zap } from 'lucide-react';
import { Seo } from '@/components/site/Seo';
import { DestinationCard, PackageCard, SectionHeading, VehicleCard } from '@/components/site/Parts';
import { EnquiryDialog, type EnquirySubject } from '@/components/site/EnquiryDialog';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Toggle } from '@/components/ui/Toggle';
import { LocationInput } from '@/components/ui/LocationInput';
import { InfoBadge, Badge } from '@/components/ui/Badge';
import { ErrorState, ImageBox, SkeletonGrid } from '@/components/ui/Feedback';
import { useSiteData } from '@/hooks/useSiteData';
import { useContact } from '@/hooks/useContact';
import { publicImageUrl } from '@/lib/supabase';
import { daysLeft, todayIST } from '@/utils/format';
import { validateJourney, type JourneyErrors } from '@/utils/validation';
import type { GalleryItem } from '@/types/db';

function HeroMedia({ items }: { items: GalleryItem[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (items.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % items.length), 5000);
    return () => window.clearInterval(t);
  }, [items.length]);
  if (!items.length) return <ImageBox src={null} alt="" placeholder="Travel photo" ratio="aspect-[4/3] lg:aspect-[3/2]" rounded="rounded-xl" className="border border-line" />;
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-line bg-sunken lg:aspect-[3/2]">
      {items.map((m, i) => (
        <img key={m.id} src={publicImageUrl('gallery-images', m.image_path) ?? ''} alt={i === index ? m.caption : ''} aria-hidden={i !== index}
          loading={i === 0 ? 'eager' : 'lazy'} fetchPriority={i === 0 ? 'high' : undefined} decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-1000"
          style={{ opacity: i === index ? m.opacity / 100 : 0 }} />
      ))}
    </div>
  );
}

function SectionBanner({ items }: { items: GalleryItem[] }) {
  const m = items[0];
  if (!m) return null;
  return <ImageBox src={publicImageUrl('gallery-images', m.image_path)} alt={m.caption} opacity={m.opacity} ratio="aspect-[5/1] min-h-[96px]" rounded="rounded-xl" className="mb-8" />;
}

function JourneyWidget() {
  const navigate = useNavigate();
  const [f, setF] = useState({ pickup: '', destination: '', date: '', time: '', members: '', roundTrip: false, returnDate: '', returnTime: '' });
  const [errors, setErrors] = useState<JourneyErrors>({});
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const today = todayIST();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = validateJourney(f);
    setErrors(next);
    if (Object.keys(next).length) return;
    navigate('/book', { state: { draft: f, startAt: 2 } });
  };
  return (
    <form onSubmit={submit} noValidate aria-labelledby="plan-heading" className="card relative z-10 p-4 shadow-lift sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 id="plan-heading" className="text-lg">Plan your journey</h2>
          <p className="text-[13px] text-muted">Tell us where and when you would like to travel.</p>
        </div>
        <InfoBadge>Step 1 of 5</InfoBadge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.2fr_1.2fr_1fr_1fr_1fr]">
        <Field label="Pickup location" required error={errors.pickup}><LocationInput value={f.pickup} onChange={(v) => set('pickup', v)} placeholder="Enter pickup" /></Field>
        <Field label="Destination" required error={errors.destination}><LocationInput value={f.destination} onChange={(v) => set('destination', v)} placeholder="Where are you going?" /></Field>
        <Field label="Date" required error={errors.date}><input type="date" className="input" min={today} value={f.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label="Time" required error={errors.time}><input type="time" className="input" value={f.time} onChange={(e) => set('time', e.target.value)} /></Field>
        <Field label="Members" required error={errors.members} className="sm:col-span-2 lg:col-span-1">
          <input type="number" inputMode="numeric" min={1} max={500} className="input" value={f.members} onChange={(e) => set('members', e.target.value)} placeholder="Number of members" />
        </Field>
      </div>
      <div className="mt-4 grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[auto_1fr_1fr_2fr]">
        <Toggle checked={f.roundTrip} onChange={(v) => set('roundTrip', v)} label="Round trip" />
        {f.roundTrip ? (
          <>
            <Field label="Return date" required error={errors.returnDate}><input type="date" className="input" min={f.date || today} value={f.returnDate} onChange={(e) => set('returnDate', e.target.value)} /></Field>
            <Field label="Return time" required error={errors.returnTime}><input type="time" className="input" value={f.returnTime} onChange={(e) => set('returnTime', e.target.value)} /></Field>
          </>
        ) : <span className="hidden lg:col-span-2 lg:block" />}
        <Button type="submit" block className={f.roundTrip ? '' : 'sm:col-start-2 lg:col-start-4'} icon={<Search className="h-4 w-4" aria-hidden />}>Find a Vehicle</Button>
      </div>
    </form>
  );
}

export default function Home() {
  const data = useSiteData();
  const contact = useContact();
  const [enquiry, setEnquiry] = useState<EnquirySubject | null>(null);
  const home = data.page('home');
  const about = data.page('about');
  const wa = contact.whatsappUrl();
  const galleryItems = data.gallery('gallery').slice(0, 8);
  const mapUrl = data.settings?.map_embed_url;

  const quick = 'card flex min-h-[72px] items-center gap-3 p-3.5 transition-colors hover:border-accent/50';
  const quickIcon = 'grid h-11 w-11 shrink-0 place-items-center rounded-md bg-accent-soft text-accent-text';

  return (
    <>
      <Seo />
      {/* ---------- hero ---------- */}
      <section className="bg-sunken/60 pb-28 pt-8 sm:pt-12 lg:pb-32">
        <div className="container-page grid items-center gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
          <div>
            <h1 className="text-[34px] leading-[1.1] xs:text-4xl sm:text-5xl">{home?.heading || 'Reliable Travel. Comfortable Journeys.'}</h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted sm:text-[17px]">
              {home?.body || 'Tours, travels and vehicle booking services.'}
            </p>
            <div className="mt-6 flex flex-col gap-2.5 xs:flex-row">
              <Link to="/book" className="btn-primary"><CalendarCheck className="h-4 w-4" aria-hidden />Book a Vehicle</Link>
              <Link to="/packages" className="btn-secondary"><Map className="h-4 w-4" aria-hidden />Explore Packages</Link>
            </div>
            <div className="mt-4 flex flex-wrap gap-1">
              {contact.telHref && <a href={contact.telHref} className="btn-ghost"><Phone className="h-4 w-4" aria-hidden />Call Now<span className="sr-only">: {contact.phone}</span></a>}
              {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-ghost"><MessageCircle className="h-4 w-4" aria-hidden />WhatsApp</a>}
            </div>
          </div>
          <HeroMedia items={data.gallery('landing')} />
        </div>
      </section>

      {/* ---------- plan your journey ---------- */}
      <section className="container-page -mt-20 lg:-mt-24" aria-label="Plan your journey">
        <JourneyWidget />
        <ul className="mt-4 grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-4">
          <li><Link to="/book" className={quick}><span className={quickIcon}><CalendarCheck className="h-5 w-5" aria-hidden /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Book a Vehicle</span><span className="block text-xs text-muted">Local or outstation travel</span></span><ArrowRight className="h-4 w-4 text-muted" aria-hidden /></Link></li>
          <li><Link to="/instant-ride" className={quick}><span className={quickIcon}><Zap className="h-5 w-5" aria-hidden /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Instant Ride</span><span className="block text-xs text-muted">Request a ride now</span></span><ArrowRight className="h-4 w-4 text-muted" aria-hidden /></Link></li>
          {wa && <li><a href={wa} target="_blank" rel="noopener noreferrer" className={quick}><span className={quickIcon}><MessageCircle className="h-5 w-5" aria-hidden /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">WhatsApp</span><span className="block text-xs text-muted">Start a conversation</span></span><ArrowRight className="h-4 w-4 text-muted" aria-hidden /></a></li>}
          {contact.telHref && <li><a href={contact.telHref} className={quick}><span className={quickIcon}><Phone className="h-5 w-5" aria-hidden /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Call Now</span><span className="block truncate text-xs text-muted">{contact.phone}</span></span><ArrowRight className="h-4 w-4 text-muted" aria-hidden /></a></li>}
        </ul>
      </section>

      {data.error && <div className="container-page mt-10"><ErrorState message={data.error} onRetry={data.reload} /></div>}

      {/* ---------- fleet ---------- */}
      <section className="container-page py-14 sm:py-20" aria-labelledby="fleet-heading">
        <SectionBanner items={data.gallery('fleet')} />
        <SectionHeading eyebrow="Our fleet" title="Travel in Comfort" intro="Choose a suitable vehicle for your journey. Final details and availability are confirmed on enquiry." />
        <span id="fleet-heading" className="sr-only">Our fleet</span>
        {data.loading ? <SkeletonGrid /> : data.vehicles.length ? (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{data.vehicles.slice(0, 3).map((v) => <VehicleCard key={v.id} vehicle={v} />)}</div>
            <div className="mt-8 text-center"><Link to="/vehicles" className="btn-secondary">View All Vehicles</Link></div>
          </>
        ) : (
          <div className="card px-6 py-10 text-center">
            <h3 className="text-lg">Our vehicle list is being updated</h3>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">You can still send a booking request — tell us your journey and our office will suggest a suitable vehicle.</p>
            <Link to="/book" className="btn-primary mt-5">Book a Vehicle</Link>
          </div>
        )}
      </section>

      {/* ---------- packages ---------- */}
      <section className="border-y border-line bg-surface py-14 sm:py-20">
        <div className="container-page">
          <SectionBanner items={data.gallery('packages')} />
          <SectionHeading eyebrow="Planned journeys" title="Explore Our Packages"
            action={data.packages.length > 3 ? <Link to="/packages" className="btn-secondary self-start sm:self-auto">View All Packages</Link> : undefined} />
          {data.loading ? <SkeletonGrid /> : data.packages.length ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{data.packages.slice(0, 3).map((p) => <PackageCard key={p.id} pkg={p} />)}</div>
          ) : (
            <p className="card px-6 py-8 text-center text-sm text-muted">Packages will appear here once they are published by the travel team. For a custom journey, <Link to="/contact" className="link">contact us</Link>.</p>
          )}
        </div>
      </section>

      {/* ---------- destinations ---------- */}
      <section className="container-page py-14 sm:py-20">
        <SectionBanner items={data.gallery('destinations')} />
        <SectionHeading eyebrow="Places to explore" title="Destination showcase" intro="Browse destinations for pilgrimage, family and customized travel."
          action={data.destinations.length > 4 ? <Link to="/destinations" className="btn-secondary self-start sm:self-auto">All Destinations</Link> : undefined} />
        {data.loading ? <SkeletonGrid count={4} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4" /> : data.destinations.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{data.destinations.slice(0, 4).map((d) => <DestinationCard key={d.id} destination={d} />)}</div>
        ) : <p className="card px-6 py-8 text-center text-sm text-muted">Destinations will be listed here soon. We travel wherever your journey takes you — just ask.</p>}
      </section>

      {/* ---------- offers ---------- */}
      <section className="container-page pb-14 sm:pb-20" aria-labelledby="offers-heading">
        {data.offers.length ? (
          <>
            <SectionHeading eyebrow="Current offers" title="Special Offers" />
            <span id="offers-heading" className="sr-only">Offers</span>
            <div className="grid gap-5 lg:grid-cols-2">
              {data.offers.map((o) => (
                <article key={o.id} className="card flex flex-col p-5 sm:p-6">
                  <div><Badge tone="accent">{daysLeft(o.expires_on)} {daysLeft(o.expires_on) === 1 ? 'day' : 'days'} left</Badge></div>
                  <h3 className="mt-3 text-xl">{o.title}</h3>
                  {o.description && <p className="mt-1.5 text-sm text-muted">{o.description}</p>}
                  <div className="mt-5 flex flex-col gap-2.5 xs:flex-row">
                    <Link to="/book" className="btn-primary">Book Now</Link>
                    <Button variant="secondary" onClick={() => setEnquiry({ kind: 'offer', id: o.id, title: o.title })} icon={<MessageCircle className="h-4 w-4" aria-hidden />}>Enquire on WhatsApp</Button>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : !data.loading && (
          <div className="card flex flex-col items-start justify-between gap-5 p-5 sm:flex-row sm:items-center sm:p-8">
            <div>
              <p className="eyebrow mb-2">Current offers</p>
              <h2 id="offers-heading" className="text-2xl">No offers available</h2>
              <p className="mt-1.5 text-sm text-muted">There are currently no active offers.</p>
              <Link to="/vehicles" className="btn-secondary mt-4">Explore services</Link>
            </div>
            <span className="hidden h-24 w-36 place-items-center rounded-lg bg-accent-soft text-accent-text sm:grid"><Ticket className="h-8 w-8" aria-hidden /></span>
          </div>
        )}
      </section>

      {/* ---------- instant ride ---------- */}
      <section className="container-page pb-14 sm:pb-20">
        <div className="flex flex-col items-start justify-between gap-5 rounded-xl bg-accent-strong p-6 text-white sm:flex-row sm:items-center sm:p-10">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-white/75">Instant ride</p>
            <h2 className="text-2xl text-white sm:text-3xl">Need a Ride Now?</h2>
            <p className="mt-2 max-w-xl text-sm text-white/85">Send a quick request with your name and number. Our office will follow up using the contact details you provide.</p>
          </div>
          <Link to="/instant-ride" className="btn shrink-0 bg-inverse text-white hover:bg-black"><Zap className="h-4 w-4" aria-hidden />Request Instant Ride</Link>
        </div>
      </section>

      {/* ---------- gallery ---------- */}
      <section className="container-page pb-14 sm:pb-20">
        <SectionHeading eyebrow="Gallery" title={data.page('gallery')?.heading || 'Moments From Our Journeys'}
          action={galleryItems.length ? <Link to="/gallery" className="btn-secondary self-start sm:self-auto">View Gallery</Link> : undefined} />
        {data.loading ? <SkeletonGrid count={4} className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4" /> : galleryItems.length ? (
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {galleryItems.map((g) => (
              <li key={g.id}><Link to="/gallery" aria-label={g.caption || 'Open gallery'} className="block">
                <ImageBox src={publicImageUrl('gallery-images', g.image_path)} alt={g.caption} opacity={g.opacity} ratio="aspect-[4/3]" rounded="rounded-lg" className="border border-line" />
              </Link></li>
            ))}
          </ul>
        ) : <p className="card px-6 py-8 text-center text-sm text-muted">Photographs from our journeys will be added here.</p>}
      </section>

      {/* ---------- testimonials ---------- */}
      <section className="container-page pb-14 sm:pb-20">
        {data.testimonials.length ? (
          <>
            <SectionHeading eyebrow="Customer experiences" title="What Our Customers Say" />
            <ul className="grid gap-5 md:grid-cols-3">
              {data.testimonials.slice(0, 6).map((t) => (
                <li key={t.id} className="card flex flex-col p-5">
                  <div className="flex gap-0.5 text-accent" role="img" aria-label={`${t.rating} out of 5 stars`}>
                    {Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`h-4 w-4 ${i < t.rating ? 'fill-current' : 'text-line'}`} aria-hidden />)}
                  </div>
                  <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-ink/85">{t.review}</blockquote>
                  <p className="mt-4 text-sm font-semibold">{t.customer_name}</p>
                </li>
              ))}
            </ul>
          </>
        ) : !data.loading && (
          <div className="card grid gap-5 p-5 sm:p-8 md:grid-cols-[1fr_2fr] md:items-center">
            <div>
              <p className="eyebrow mb-2">Customer experiences</p>
              <h2 className="text-2xl">Testimonials</h2>
              <p className="mt-1.5 text-sm text-muted">Customer feedback will appear here once it is published.</p>
            </div>
            <div className="flex flex-col items-center rounded-lg bg-sunken px-6 py-8 text-center">
              <MessageSquareDashed className="mb-2 h-6 w-6 text-muted" aria-hidden />
              <p className="text-sm font-semibold">No testimonials published yet</p>
            </div>
          </div>
        )}
      </section>

      {/* ---------- about ---------- */}
      <section className="border-t border-line bg-surface py-14 sm:py-20">
        <div className="container-page grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <ImageBox src={publicImageUrl('logos', data.settings?.logo_secondary_path)} alt={contact.companyName} placeholder="Team photo" ratio="aspect-[4/3]" rounded="rounded-xl" className="border border-line" />
          <div>
            <p className="eyebrow mb-2">About us</p>
            <h2 className="text-2xl sm:text-[32px] sm:leading-tight">{about?.heading || 'Travel With Confidence'}</h2>
            {about?.body && <p className="mt-3 text-[15px] leading-relaxed text-muted">{about.body}</p>}
            <ul className="mt-5 space-y-2.5">
              {['Clear enquiry-based booking', 'Journey details reviewed before confirmation', 'Local, outstation, pilgrimage and customized travel', 'Support through call and WhatsApp'].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success-soft text-success"><Check className="h-3 w-3" aria-hidden /></span>{t}</li>
              ))}
            </ul>
            <Link to="/about" className="btn-secondary mt-6">About Our Service</Link>
          </div>
        </div>
      </section>

      {/* ---------- contact ---------- */}
      <section className="container-page py-14 sm:py-20">
        <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
          <div className="card p-5 sm:p-6">
            <p className="eyebrow mb-2">Contact</p>
            <h2 className="text-2xl">{data.page('contact')?.heading || 'Plan a journey with us'}</h2>
            <ul className="mt-5 space-y-4 text-sm">
              {contact.address && <li className="flex gap-3"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" aria-hidden /><span><span className="block font-semibold">Address</span><span className="text-muted">{contact.address}</span></span></li>}
              {contact.telHref && <li className="flex gap-3"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" aria-hidden /><span><span className="block font-semibold">Phone</span><a href={contact.telHref} className="text-muted hover:text-ink">{contact.phone}</a></span></li>}
              {contact.email && <li className="flex gap-3"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" aria-hidden /><span className="min-w-0"><span className="block font-semibold">Email</span><a href={`mailto:${contact.email}`} className="break-all text-muted hover:text-ink">{contact.email}</a></span></li>}
              {wa && <li className="flex gap-3"><MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" aria-hidden /><span><span className="block font-semibold">WhatsApp</span><a href={wa} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-ink">Chat with us</a></span></li>}
            </ul>
            <Link to="/contact" className="btn-primary mt-6">Send a Message</Link>
          </div>
          <div className="min-h-[300px] overflow-hidden rounded-lg border border-line bg-sunken">
            {mapUrl ? <iframe title="Office location map" src={mapUrl} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" className="h-full min-h-[300px] w-full border-0" allowFullScreen />
              : <div className="grid h-full min-h-[300px] place-items-center text-sm text-muted">Map will appear here once the office location is set.</div>}
          </div>
        </div>
      </section>

      <EnquiryDialog subject={enquiry} onClose={() => setEnquiry(null)} />
    </>
  );
}
