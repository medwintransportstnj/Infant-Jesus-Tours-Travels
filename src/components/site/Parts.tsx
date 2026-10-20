import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, ChevronRight, Clock, MapPin, Snowflake, Users } from 'lucide-react';
import { ImageBox } from '@/components/ui/Feedback';
import { useSiteData } from '@/hooks/useSiteData';
import { publicImageUrl } from '@/lib/supabase';
import type { Destination, TourPackage, Vehicle } from '@/types/db';

/** Inner-page banner: breadcrumb, title and intro on a quiet band, so every page opens the same way. */
export function PageHeader({ title, intro, children, crumb }: { title: string; intro?: string; children?: ReactNode; crumb?: string }) {
  return (
    <div className="mb-8 rounded-3xl bg-surface px-5 pb-7 pt-5 sm:mb-10 sm:px-8 sm:pb-9 sm:pt-7">
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-[13px] text-muted">
        <Link to="/" className="hover:text-ink">Home</Link><ChevronRight className="h-3.5 w-3.5" aria-hidden /><span aria-current="page" className="text-ink">{crumb ?? title}</span>
      </nav>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[30px] leading-[1.1] sm:text-[42px]">{title}</h1>
          {intro && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted sm:text-base">{intro}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function SectionHeading({ eyebrow, title, intro, action, align = 'left' }: { eyebrow?: string; title: string; intro?: string; action?: ReactNode; align?: 'left' | 'center' }) {
  if (align === 'center') {
    return (
      <div className="mx-auto mb-8 max-w-2xl text-center sm:mb-10">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h2 className="text-[26px] leading-tight sm:text-[36px]">{title}</h2>
        {intro && <p className="mt-3 text-[15px] leading-relaxed text-muted sm:text-base">{intro}</p>}
      </div>
    );
  }
  return (
    <div className="mb-7 flex flex-col gap-3 sm:mb-9 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h2 className="text-[26px] leading-tight sm:text-[36px]">{title}</h2>
        {intro && <p className="mt-3 text-[15px] leading-relaxed text-muted sm:text-base">{intro}</p>}
      </div>
      {action}
    </div>
  );
}

export function vehicleSpecs(v: Vehicle) {
  return { seats: `${v.capacity} seats`, ac: v.has_ac ? 'AC' : 'Non-AC', price: v.price_label || 'Price on enquiry' };
}

interface VehicleCardProps { vehicle: Vehicle; selected?: boolean; onSelect?: () => void; note?: string | null }
export function VehicleCard({ vehicle: v, selected, onSelect, note }: VehicleCardProps) {
  const { categoryName } = useSiteData();
  const s = vehicleSpecs(v);
  const category = categoryName(v.category_id);
  return (
    <article className={`group flex flex-col overflow-hidden rounded-2xl border bg-card transition-shadow duration-200 hover:shadow-card ${selected ? 'border-accent ring-4 ring-accent/15' : 'border-line'}`}>
      <div className="relative">
        <ImageBox src={publicImageUrl('vehicle-images', v.image_path)} alt={v.name} placeholder={category || 'Vehicle'} ratio="aspect-[16/10]" />
        {category && <span className="absolute left-3 top-3 rounded-full bg-card/95 px-2.5 py-1 text-xs font-semibold text-ink shadow-sm">{category}</span>}
      </div>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg">{v.name}</h3>
          <p className="shrink-0 pt-0.5 text-right text-[13px] font-semibold text-ink">{s.price}</p>
        </div>
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Features">
          <li className="chip"><Users className="h-3.5 w-3.5" aria-hidden />{s.seats}</li>
          <li className="chip"><Snowflake className="h-3.5 w-3.5" aria-hidden />{s.ac}</li>
        </ul>
        {note && <p className="mt-3 rounded-xl bg-accent-soft px-3 py-2 text-[13px] font-medium text-accent-text">{note}</p>}
        <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
          <Link to={`/vehicles/${v.id}`} className="btn-secondary px-3">View Details</Link>
          {onSelect ? (
            <button type="button" onClick={onSelect} aria-pressed={selected} className={selected ? 'btn-dark px-3' : 'btn-primary px-3'}>
              {selected ? <><Check className="h-4 w-4" aria-hidden />Selected</> : 'Select'}
            </button>
          ) : <Link to={`/book?vehicle=${v.id}`} className="btn-primary px-3">Book Vehicle</Link>}
        </div>
      </div>
    </article>
  );
}

/** Photo-led card: the title sits on the image, details below. */
export function PackageCard({ pkg }: { pkg: TourPackage }) {
  const meta = [pkg.duration, pkg.route].filter(Boolean);
  return (
    <Link to={`/packages/${pkg.id}`} className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-card transition-shadow duration-200 hover:shadow-card">
      <div className="relative">
        <ImageBox src={publicImageUrl('website-assets', pkg.image_path)} alt="" placeholder={pkg.package_type || 'Package'} ratio="aspect-[4/3]" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        {pkg.package_type && <span className="absolute left-3 top-3 rounded-full bg-card/95 px-2.5 py-1 text-xs font-semibold text-ink shadow-sm">{pkg.package_type}</span>}
        <h3 className="absolute inset-x-4 bottom-3 text-lg leading-snug text-white">{pkg.title}</h3>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        {meta.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
            {pkg.duration && <li className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" aria-hidden />{pkg.duration}</li>}
            {pkg.route && <li className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" aria-hidden />{pkg.route}</li>}
          </ul>
        )}
        {pkg.summary && <p className="line-clamp-2 text-sm text-muted">{pkg.summary}</p>}
        <div className="mt-auto flex items-center justify-between gap-3 pt-1">
          <span className="text-[13px] font-semibold text-ink">{pkg.price_label || 'Price on enquiry'}</span>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-accent-text">View package<ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden /></span>
        </div>
      </div>
    </Link>
  );
}

/** Tall image tile with the place name over the photo. */
export function DestinationCard({ destination: d }: { destination: Destination }) {
  return (
    <Link to="/book" state={{ destination: d.name }} aria-label={`Plan a journey to ${d.name}`}
      className="group relative block overflow-hidden rounded-2xl border border-line bg-sunken">
      <ImageBox src={publicImageUrl('website-assets', d.image_path)} alt="" placeholder="Destination" ratio="aspect-[3/4]" className="transition-transform duration-500 group-hover:scale-[1.03]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4">
        {d.distance_label && <p className="mb-1 text-xs font-medium text-white/80">{d.distance_label}</p>}
        <h3 className="text-xl leading-tight text-white">{d.name}</h3>
        {d.description && <p className="mt-1 line-clamp-2 text-[13px] text-white/80">{d.description}</p>}
        <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1.5 text-[13px] font-semibold text-ink">Plan this trip<ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></span>
      </div>
    </Link>
  );
}
