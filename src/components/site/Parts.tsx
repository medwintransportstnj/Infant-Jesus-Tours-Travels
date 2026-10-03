import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Snowflake, Users } from 'lucide-react';
import { ImageBox } from '@/components/ui/Feedback';
import { InfoBadge } from '@/components/ui/Badge';
import { useSiteData } from '@/hooks/useSiteData';
import { publicImageUrl } from '@/lib/supabase';
import type { Destination, TourPackage, Vehicle } from '@/types/db';

export function PageHeader({ title, intro, children }: { title: string; intro?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-tight sm:text-4xl">{title}</h1>
        {intro && <p className="mt-2 max-w-2xl text-[15px] text-muted">{intro}</p>}
      </div>
      {children}
    </div>
  );
}

export function SectionHeading({ eyebrow, title, intro, action }: { eyebrow?: string; title: string; intro?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h2 className="text-2xl sm:text-[32px] sm:leading-tight">{title}</h2>
        {intro && <p className="mt-2 max-w-2xl text-[15px] text-muted">{intro}</p>}
      </div>
      {action}
    </div>
  );
}

export function vehicleSpecs(v: Vehicle) {
  return { seats: `${v.capacity} seater`, ac: v.has_ac ? 'AC' : 'Non-AC', price: v.price_label || 'Available on enquiry' };
}

interface VehicleCardProps { vehicle: Vehicle; selected?: boolean; onSelect?: () => void; note?: string | null }
export function VehicleCard({ vehicle: v, selected, onSelect, note }: VehicleCardProps) {
  const { categoryName } = useSiteData();
  const s = vehicleSpecs(v);
  const category = categoryName(v.category_id);
  return (
    <article className={`card flex flex-col overflow-hidden shadow-card transition-shadow ${selected ? 'border-accent ring-2 ring-accent/30' : ''}`}>
      <ImageBox src={publicImageUrl('vehicle-images', v.image_path)} alt={v.name} placeholder={category || 'Vehicle'} />
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <h3 className="text-lg">{v.name}</h3>
        {category && <p className="text-[13px] text-muted">{category}</p>}
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
          <li className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" aria-hidden />{s.seats}</li>
          <li className="inline-flex items-center gap-1.5"><Snowflake className="h-3.5 w-3.5 text-info" aria-hidden />{s.ac}</li>
        </ul>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <InfoBadge>Availability: Enquire</InfoBadge>
          <span className="text-[13px] font-semibold text-ink">{s.price}</span>
        </div>
        {note && <p className="mt-3 rounded-md bg-accent-soft px-3 py-2 text-[13px] font-medium text-accent-text">{note}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2.5 pt-1">
          <Link to={`/vehicles/${v.id}`} className="btn-secondary">View Details</Link>
          {onSelect ? (
            <button type="button" onClick={onSelect} aria-pressed={selected} className="btn-primary">
              {selected ? <><Check className="h-4 w-4" aria-hidden />Selected</> : 'Select'}
            </button>
          ) : <Link to={`/book?vehicle=${v.id}`} className="btn-primary">Book Vehicle</Link>}
        </div>
      </div>
    </article>
  );
}

export function PackageCard({ pkg }: { pkg: TourPackage }) {
  const meta = [pkg.duration, pkg.route].filter(Boolean).join(' · ');
  return (
    <article className="card flex flex-col overflow-hidden">
      <ImageBox src={publicImageUrl('website-assets', pkg.image_path)} alt={pkg.title} placeholder={pkg.package_type || 'Package'} />
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <h3 className="text-base">{pkg.title}</h3>
        <p className="mt-1.5 line-clamp-3 text-[13px] text-muted">{pkg.summary || meta || 'Details on enquiry'}</p>
        <Link to={`/packages/${pkg.id}`} className="link mt-auto inline-flex min-h-11 items-center gap-1.5 pt-2 text-sm" aria-label={`View package: ${pkg.title}`}>
          View Package <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </article>
  );
}

export function DestinationCard({ destination: d }: { destination: Destination }) {
  return (
    <article className="card flex flex-col overflow-hidden">
      <ImageBox src={publicImageUrl('website-assets', d.image_path)} alt={d.name} placeholder="Destination" />
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <h3 className="text-base">{d.name}</h3>
        {d.description && <p className="mt-1.5 line-clamp-3 text-[13px] text-muted">{d.description}</p>}
        {d.distance_label && <p className="mt-2 text-[13px] font-medium text-ink">{d.distance_label}</p>}
        <Link to="/book" state={{ destination: d.name }} className="link mt-auto inline-flex min-h-11 items-center gap-1.5 pt-2 text-sm" aria-label={`Plan a journey to ${d.name}`}>
          Plan this journey <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </article>
  );
}
