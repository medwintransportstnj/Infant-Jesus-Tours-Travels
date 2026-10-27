import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, CalendarCheck, CarFront, CheckCircle2, Mail, MapPin, MessageCircle, Phone, PhoneCall, Quote, Search, Star, Ticket, Zap,
} from 'lucide-react';
import { Seo } from '@/components/site/Seo';
import { DestinationCard, PackageCard, SectionHeading, VehicleCard } from '@/components/site/Parts';
import { EnquiryDialog, type EnquirySubject } from '@/components/site/EnquiryDialog';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Toggle } from '@/components/ui/Toggle';
import { LocationInput } from '@/components/ui/LocationInput';
import { ErrorState, ImageBox, SkeletonGrid } from '@/components/ui/Feedback';
import { useSiteData } from '@/hooks/useSiteData';
import { useContact } from '@/hooks/useContact';
import { publicImageUrl } from '@/lib/supabase';
import { daysLeft, formatDate, todayIST } from '@/utils/format';
import { validateJourney, type JourneyErrors } from '@/utils/validation';
import type { GalleryItem } from '@/types/db';

/** Full-bleed hero photo(s) from Admin → Gallery → "Landing Page". Cross-fades when there is more than one. */
function HeroBackdrop({ items }: { items: GalleryItem[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (items.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % items.length), 6000);
    return () => window.clearInterval(t);
  }, [items.length]);
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-inverse">
      {items.map((m, i) => (
        <img key={m.id} src={publicImageUrl('gallery-images', m.image_path) ?? ''} alt=""
          loading={i === 0 ? 'eager' : 'lazy'} fetchPriority={i === 0 ? 'high' : undefined} decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-[1500ms]"
          style={{ opacity: i === index ? m.opacity / 100 : 0 }} />
      ))}
      {/* Without a photo the hero is the brand: charcoal with a soft red glow. */}
      {!items.length && <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_85%_10%,rgb(var(--accent)/0.45),transparent_55%)]" />}
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/55 to-black/15" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/50 to-transparent" />
    </div>
  );
}

/** Route search that starts the booking flow at step 2 with the journey already filled in. */
function JourneySearch() {
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
    <form onSubmit={submit} noValidate aria-labelledby="plan-heading" className="relative z-10 rounded-3xl border border-line bg-card p-4 shadow-lift sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="plan-heading" className="text-lg sm:text-xl">Where are you travelling?</h2>
        <Toggle checked={f.roundTrip} onChange={(v) => set('roundTrip', v)} label="Round trip" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1.25fr_1.25fr_1fr_0.9fr_0.85fr_auto] lg:items-start">
        <Field label="From" required error={errors.pickup} className="col-span-2 sm:col-span-1"><LocationInput value={f.pickup} onChange={(v) => set('pickup', v)} placeholder="Pickup city or place" /></Field>
        <Field label="To" required error={errors.destination} className="col-span-2 sm:col-span-1"><LocationInput value={f.destination} onChange={(v) => set('destination', v)} placeholder="Destination" /></Field>
        <Field label="Date" required error={errors.date}><input type="date" className="input" min={today} value={f.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label="Time" required error={errors.time}><input type="time" className="input" value={f.time} onChange={(e) => set('time', e.target.value)} /></Field>
        <Field label="Members" required error={errors.members} className="col-span-2 sm:col-span-1">
          <input type="number" inputMode="numeric" min={1} max={500} className="input" value={f.members} onChange={(e) => set('members', e.target.value)} placeholder="People" />
        </Field>
        <div className="col-span-2 sm:col-span-1 sm:pt-[26px] lg:col-span-1">
          <Button type="submit" block className="min-h-12 lg:w-auto lg:px-6" icon={<Search className="h-4 w-4" aria-hidden />}>Find a Vehicle</Button>
        </div>
      </div>
      {f.roundTrip && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:max-w-md">
          <Field label="Return date" required error={errors.returnDate}><input type="date" className="input" min={f.date || today} value={f.returnDate} onChange={(e) => set('returnDate', e.target.value)} /></Field>
          <Field label="Return time" required error={errors.returnTime}><input type="time" className="input" value={f.returnTime} onChange={(e) => set('returnTime', e.target.value)} /></Field>
        </div>
      )}
    </form>
  );
}

// "How booking works" mirrors the real booking statuses, so it is a true sequence.
const STEPS = [
  { Icon: CalendarCheck, title: 'Send your trip', body: 'Tell us the route, date and number of people. You get a booking reference straight away.' },
  { Icon: PhoneCall, title: 'Our office calls you', body: 'We confirm the vehicle, timing and fare with you by phone or WhatsApp.' },
  { Icon: CheckCircle2, title: 'Booking confirmed', body: 'You are notified the moment it is confirmed, and again when your driver is assigned.' },
  { Icon: CarFront, title: 'Travel', body: 'Your driver picks you up. Follow every update from My account.' },
];

export default function Home() {
  const data = useSiteData();
  const contact = useContact();
  const [enquiry, setEnquiry] = useState<EnquirySubject | null>(null);
  const home = data.page('home');
  const about = data.page('about');
  const wa = contact.whatsappUrl();
  const galleryItems = data.gallery('gallery').slice(0, 6);
  const mapUrl = data.settings?.map_embed_url;

  return (
    <>
      <Seo />
      {/* ---------- hero ---------- */}
      <section className="relative isolate">
        <HeroBackdrop items={data.gallery('landing')} />
        <div className="container-page relative pb-32 pt-14 sm:pb-36 sm:pt-20 lg:pb-44 lg:pt-28">
          <div className="max-w-2xl text-white">
            <h1 className="text-[38px] font-semibold leading-[1.05] text-white xs:text-[44px] sm:text-6xl lg:text-[68px]">
              {home?.heading || 'Reliable Travel. Comfortable Journeys.'}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/85 sm:text-lg">
              {home?.body || 'Tours, travels and vehicle booking services.'}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/book" className="btn-primary min-h-12 px-6"><CalendarCheck className="h-4 w-4" aria-hidden />Book a Vehicle</Link>
              <Link to="/instant-ride" className="btn min-h-12 border border-white/35 bg-white/10 px-6 text-white backdrop-blur hover:bg-white/20"><Zap className="h-4 w-4" aria-hidden />Instant Ride</Link>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {contact.telHref && <a href={contact.telHref} className="inline-flex min-h-11 items-center gap-2 text-white/85 hover:text-white"><Phone className="h-4 w-4" aria-hidden />Call {contact.phone}</a>}
              {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-white/85 hover:text-white"><MessageCircle className="h-4 w-4" aria-hidden />Chat on WhatsApp</a>}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- search ---------- */}
      <section className="container-page -mt-24 sm:-mt-28" aria-label="Plan your journey">
        <JourneySearch />
      </section>

      {data.error && <div className="container-page mt-10"><ErrorState message={data.error} onRetry={data.reload} /></div>}

      {/* ---------- fleet ---------- */}
      <section className="container-page py-16 sm:py-24" aria-labelledby="fleet-heading">
        <SectionHeading eyebrow="Our fleet" title="Choose your vehicle" intro="Sedans for small families, SUVs and travellers for groups. Availability and fare are confirmed when our office calls you."
          action={data.vehicles.length > 3 ? <Link to="/vehicles" className="btn-secondary self-start sm:self-auto">All vehicles<ArrowRight className="h-4 w-4" aria-hidden /></Link> : undefined} />
        <span id="fleet-heading" className="sr-only">Our fleet</span>
        {data.loading ? <SkeletonGrid /> : data.vehicles.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{data.vehicles.slice(0, 3).map((v) => <VehicleCard key={v.id} vehicle={v} />)}</div>
        ) : (
          <div className="card px-6 py-10 text-center">
            <h3 className="text-lg">Our vehicle list is being updated</h3>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">You can still send a booking request — tell us your journey and our office will suggest a suitable vehicle.</p>
            <Link to="/book" className="btn-primary mt-5">Book a Vehicle</Link>
          </div>
        )}
      </section>

      {/* ---------- packages ---------- */}
      <section className="bg-surface py-16 sm:py-24">
        <div className="container-page">
          <SectionHeading eyebrow="Tour packages" title="Planned journeys"
            intro="Devotional trips, hill stations and family tours, with the route and stops already planned."
            action={data.packages.length > 3 ? <Link to="/packages" className="btn-secondary self-start sm:self-auto">All packages<ArrowRight className="h-4 w-4" aria-hidden /></Link> : undefined} />
          {data.loading ? <SkeletonGrid /> : data.packages.length ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{data.packages.slice(0, 3).map((p) => <PackageCard key={p.id} pkg={p} />)}</div>
          ) : (
            <p className="card px-6 py-8 text-center text-sm text-muted">Packages will appear here once they are published. For a custom journey, <Link to="/contact" className="link">contact us</Link>.</p>
          )}
        </div>
      </section>

      {/* ---------- destinations ---------- */}
      <section className="container-page py-16 sm:py-24">
        <SectionHeading eyebrow="Destinations" title="Where our travellers go"
          action={data.destinations.length > 4 ? <Link to="/destinations" className="btn-secondary self-start sm:self-auto">All destinations<ArrowRight className="h-4 w-4" aria-hidden /></Link> : undefined} />
        {data.loading ? <SkeletonGrid count={4} className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4" /> : data.destinations.length ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">{data.destinations.slice(0, 4).map((d) => <DestinationCard key={d.id} destination={d} />)}</div>
        ) : <p className="card px-6 py-8 text-center text-sm text-muted">Destinations will be listed here soon. We travel wherever your journey takes you — just ask.</p>}
      </section>

      {/* ---------- how booking works ---------- */}
      <section className="bg-inverse py-16 text-white sm:py-24" aria-labelledby="how-heading">
        <div className="container-page">
          <div className="mb-10 max-w-2xl">
            <p className="mb-2 text-[13px] font-semibold text-[#ff8a90]">How booking works</p>
            <h2 id="how-heading" className="text-[26px] leading-tight text-white sm:text-[36px]">From request to pickup, you always know where your booking stands.</h2>
          </div>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ Icon, title, body }, i) => (
              <li key={title} className="relative rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <div className="mb-4 flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-accent text-white"><Icon className="h-5 w-5" aria-hidden /></span>
                  <span className="text-sm font-semibold text-white/50">Step {i + 1}</span>
                </div>
                <h3 className="text-lg text-white">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-white/70">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- offers ---------- */}
      {data.offers.length > 0 && (
        <section className="container-page pt-16 sm:pt-24" aria-labelledby="offers-heading">
          <SectionHeading eyebrow="Current offers" title="Special offers" />
          <span id="offers-heading" className="sr-only">Offers</span>
          <div className="grid gap-5 lg:grid-cols-2">
            {data.offers.map((o) => {
              const left = daysLeft(o.expires_on);
              return (
                <article key={o.id} className="relative flex flex-col overflow-hidden rounded-2xl border border-accent/25 bg-accent-soft/50 p-5 sm:p-6">
                  <Ticket aria-hidden className="absolute -right-4 -top-4 h-28 w-28 rotate-12 text-accent/10" />
                  <p className="text-[13px] font-semibold text-accent-text">{left} {left === 1 ? 'day' : 'days'} left · until {formatDate(o.expires_on)}</p>
                  <h3 className="mt-2 text-xl">{o.title}</h3>
                  {o.description && <p className="mt-1.5 max-w-lg text-sm text-muted">{o.description}</p>}
                  <div className="mt-5 flex flex-wrap gap-2.5">
                    <Link to="/book" className="btn-primary">Book Now</Link>
                    <Button variant="secondary" onClick={() => setEnquiry({ kind: 'offer', id: o.id, title: o.title })} icon={<MessageCircle className="h-4 w-4" aria-hidden />}>Enquire on WhatsApp</Button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* ---------- gallery + testimonials ---------- */}
      <section className="container-page py-16 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:gap-14">
          <div>
            <SectionHeading eyebrow="Gallery" title={data.page('gallery')?.heading || 'Moments from our journeys'}
              action={galleryItems.length ? <Link to="/gallery" className="btn-secondary self-start sm:self-auto">View Gallery</Link> : undefined} />
            {data.loading ? <SkeletonGrid count={4} className="grid grid-cols-2 gap-3" /> : galleryItems.length ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {galleryItems.map((g, i) => (
                  <li key={g.id} className={i === 0 ? 'col-span-2 row-span-2' : ''}>
                    <Link to="/gallery" aria-label={g.caption || 'Open gallery'} className="block h-full overflow-hidden rounded-2xl">
                      <ImageBox src={publicImageUrl('gallery-images', g.image_path)} alt={g.caption} opacity={g.opacity} ratio={i === 0 ? 'aspect-square sm:aspect-auto sm:h-full' : 'aspect-square'} className="h-full" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="card px-6 py-8 text-center text-sm text-muted">Photographs from our journeys will be added here.</p>}
          </div>
          <div>
            <SectionHeading eyebrow="Reviews" title="What travellers say" />
            {data.testimonials.length ? (
              <ul className="flex flex-col gap-4">
                {data.testimonials.slice(0, 3).map((t) => (
                  <li key={t.id} className="card relative p-5">
                    <Quote aria-hidden className="absolute right-4 top-4 h-8 w-8 text-accent/15" />
                    <div className="flex gap-0.5 text-accent" role="img" aria-label={`${t.rating} out of 5 stars`}>
                      {Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`h-4 w-4 ${i < t.rating ? 'fill-current' : 'text-line'}`} aria-hidden />)}
                    </div>
                    <blockquote className="mt-3 text-[15px] leading-relaxed text-ink/85">{t.review}</blockquote>
                    <p className="mt-3 text-sm font-semibold">{t.customer_name}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="card px-6 py-8 text-center text-sm text-muted">Reviews from our travellers will appear here once they are published.</p>}
          </div>
        </div>
      </section>

      {/* ---------- about + contact ---------- */}
      <section className="bg-surface py-16 sm:py-24">
        <div className="container-page grid gap-6 lg:grid-cols-2 lg:gap-8">
          <div className="card flex flex-col p-6 sm:p-8">
            <p className="eyebrow mb-2">About us</p>
            <h2 className="text-[26px] leading-tight sm:text-[32px]">{about?.heading || 'Travel With Confidence'}</h2>
            {about?.body && <p className="mt-3 text-[15px] leading-relaxed text-muted">{about.body}</p>}
            <ul className="mt-6 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {['Booking reference for every request', 'Office confirms every trip by phone', 'Local, outstation and pilgrimage trips', 'Live updates in My account'].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />{t}</li>
              ))}
            </ul>
            <div className="mt-auto flex flex-wrap gap-2.5 pt-8">
              <Link to="/about" className="btn-secondary">About our service</Link>
              <Link to="/contact" className="btn-dark">Send a message</Link>
            </div>
          </div>
          <div className="card overflow-hidden">
            <div className="grid gap-4 p-6 sm:grid-cols-2 sm:p-8">
              {contact.address && <p className="flex gap-3 text-sm sm:col-span-2"><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-accent-text" aria-hidden /><span><span className="block font-semibold">Office</span><span className="text-muted">{contact.address}</span></span></p>}
              {contact.telHref && <a href={contact.telHref} className="flex gap-3 text-sm hover:text-accent-text"><Phone className="mt-0.5 h-5 w-5 shrink-0 text-accent-text" aria-hidden /><span><span className="block font-semibold">Phone</span><span className="text-muted">{contact.phone}</span></span></a>}
              {contact.email && <a href={`mailto:${contact.email}`} className="flex min-w-0 gap-3 text-sm hover:text-accent-text"><Mail className="mt-0.5 h-5 w-5 shrink-0 text-accent-text" aria-hidden /><span className="min-w-0"><span className="block font-semibold">Email</span><span className="block break-all text-muted">{contact.email}</span></span></a>}
            </div>
            <div className="h-[260px] border-t border-line bg-sunken sm:h-[300px]">
              {mapUrl ? <iframe title="Office location map" src={mapUrl} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" className="h-full w-full border-0" allowFullScreen />
                : <div className="grid h-full place-items-center text-sm text-muted">Map will appear here once the office location is set.</div>}
            </div>
          </div>
        </div>
      </section>

      <EnquiryDialog subject={enquiry} onClose={() => setEnquiry(null)} />
    </>
  );
}
