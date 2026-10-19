import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Car, HelpCircle } from 'lucide-react';
import { Seo } from '@/components/site/Seo';
import { PageHeader, VehicleCard, vehicleSpecs } from '@/components/site/Parts';
import { Field } from '@/components/ui/Field';
import { InfoBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, ImageBox, Skeleton, SkeletonGrid } from '@/components/ui/Feedback';
import { useSiteData } from '@/hooks/useSiteData';
import { publicImageUrl } from '@/lib/supabase';

export function Vehicles() {
  const { vehicles, categories, categoryName, loading, error, reload } = useSiteData();
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [capacity, setCapacity] = useState('');
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return vehicles.filter((v) =>
      (!term || v.name.toLowerCase().includes(term) || categoryName(v.category_id).toLowerCase().includes(term)) &&
      (!category || v.category_id === category) && (!capacity || v.capacity >= Number(capacity)));
  }, [vehicles, q, category, capacity, categoryName]);

  return (
    <div className="container-page py-8 sm:py-12">
      <Seo title="Vehicles" description="Browse our vehicles by category and seating capacity, then send a booking enquiry." />
      <PageHeader title="Our Vehicles" intro="Filter by category or group size and enquire. Final details and availability are confirmed by our office." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Field label="Search"><input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vehicle name or category" /></Field>
        <Field label="Category">
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Group size">
          <select className="input" value={capacity} onChange={(e) => setCapacity(e.target.value)}>
            <option value="">Any capacity</option>
            {[4, 7, 12, 20, 40].map((n) => <option key={n} value={n}>{n}+ seats</option>)}
          </select>
        </Field>
      </div>
      {loading ? <SkeletonGrid count={6} /> : error && !vehicles.length ? <ErrorState message={error} onRetry={reload} /> : filtered.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{filtered.map((v) => <VehicleCard key={v.id} vehicle={v} />)}</div>
      ) : vehicles.length ? (
        <EmptyState title="No vehicles match these filters" body="Try a different category or a smaller group size."
          action={<button type="button" className="btn-secondary" onClick={() => { setQ(''); setCategory(''); setCapacity(''); }}>Clear filters</button>} />
      ) : (
        <EmptyState icon={<Car className="h-6 w-6" aria-hidden />} title="Our vehicle list is being updated"
          body="You can still send a booking request and our office will suggest a suitable vehicle."
          action={<Link to="/book" className="btn-primary">Book a Vehicle</Link>} />
      )}
    </div>
  );
}

export function VehicleDetail() {
  const { id } = useParams();
  const { vehicles, categoryName, loading } = useSiteData();
  const v = vehicles.find((x) => x.id === id);
  if (loading) return <div className="container-page grid gap-6 py-12 lg:grid-cols-2"><Skeleton className="aspect-[4/3] w-full" /><div className="space-y-4"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-4 w-1/3" /><Skeleton className="h-32 w-full" /></div></div>;
  if (!v) return (
    <div className="container-page py-12">
      <Seo title="Vehicle not found" noindex />
      <EmptyState icon={<Car className="h-6 w-6" aria-hidden />} title="This vehicle is not available" body="It may have been removed or is no longer offered." action={<Link to="/vehicles" className="btn-primary">View All Vehicles</Link>} />
    </div>
  );
  const s = vehicleSpecs(v);
  const category = categoryName(v.category_id);
  return (
    <div className="container-page py-8 sm:py-12">
      <Seo title={v.name} description={v.description || `${v.name} — ${s.seats}, ${s.ac}. Enquire for availability.`} />
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted"><Link to="/vehicles" className="link">Vehicles</Link> / <span aria-current="page">{v.name}</span></nav>
      <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
        <ImageBox src={publicImageUrl('vehicle-images', v.image_path)} alt={v.name} placeholder={category || 'Vehicle'} ratio="aspect-[4/3]" rounded="rounded-xl" className="border border-line" eager />
        <div>
          <h1 className="text-[28px] leading-tight sm:text-4xl">{v.name}</h1>
          {category && <p className="mt-1 text-muted">{category}</p>}
          <div className="mt-3"><InfoBadge>Availability: Enquire</InfoBadge></div>
          <dl className="mt-5 divide-y divide-line border-y border-line text-sm">
            <div className="flex justify-between py-3"><dt className="text-muted">Capacity</dt><dd className="font-semibold">{s.seats}</dd></div>
            <div className="flex justify-between py-3"><dt className="text-muted">Air conditioning</dt><dd className="font-semibold">{s.ac}</dd></div>
            <div className="flex justify-between py-3"><dt className="text-muted">Price / details</dt><dd className="font-semibold">{s.price}</dd></div>
          </dl>
          {v.description && <p className="mt-5 whitespace-pre-line text-[15px] leading-relaxed text-muted">{v.description}</p>}
          <Link to={`/book?vehicle=${v.id}`} className="btn-primary mt-6 w-full sm:w-auto">Book This Vehicle</Link>
        </div>
      </div>
      <p className="card mt-8 flex items-start gap-2.5 p-4 text-sm text-muted">
        <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>Not sure which vehicle fits? <Link to="/book" className="link">Share your passenger count and journey</Link> for a recommendation.</span>
      </p>
    </div>
  );
}
