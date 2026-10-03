import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Map } from 'lucide-react';
import { Seo } from '@/components/site/Seo';
import { PackageCard, PageHeader } from '@/components/site/Parts';
import { EnquiryDialog, type EnquirySubject } from '@/components/site/EnquiryDialog';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { EmptyState, ErrorState, ImageBox, Skeleton, SkeletonGrid } from '@/components/ui/Feedback';
import { useSiteData } from '@/hooks/useSiteData';
import { publicImageUrl } from '@/lib/supabase';

export function Packages() {
  const { packages, loading, error, reload } = useSiteData();
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const types = useMemo(() => [...new Set(packages.map((p) => p.package_type).filter(Boolean))].sort(), [packages]);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return packages.filter((p) => (!type || p.package_type === type) &&
      (!term || [p.title, p.route, p.summary].some((s) => s.toLowerCase().includes(term))));
  }, [packages, q, type]);
  return (
    <div className="container-page py-8 sm:py-12">
      <Seo title="Packages" description="Tour packages and trip types — enquire for itinerary, inclusions and availability." />
      <PageHeader title="Packages" intro="Planned journeys and trip types. Enquire for itinerary details and availability." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Field label="Search packages"><input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by place or title" /></Field>
        <Field label="Type">
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All package types</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
      </div>
      {loading ? <SkeletonGrid count={6} /> : error && !packages.length ? <ErrorState message={error} onRetry={reload} /> : filtered.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{filtered.map((p) => <PackageCard key={p.id} pkg={p} />)}</div>
      ) : packages.length ? (
        <EmptyState title="No packages match your search" action={<button type="button" className="btn-secondary" onClick={() => { setQ(''); setType(''); }}>Clear filters</button>} />
      ) : (
        <EmptyState icon={<Map className="h-6 w-6" aria-hidden />} title="Packages are coming soon" body="Tell us where you would like to go and we will plan a custom journey for you."
          action={<Link to="/contact" className="btn-primary">Contact Us</Link>} />
      )}
    </div>
  );
}

export function PackageDetail() {
  const { id } = useParams();
  const { packages, loading } = useSiteData();
  const [enquiry, setEnquiry] = useState<EnquirySubject | null>(null);
  const p = packages.find((x) => x.id === id);
  if (loading) return <div className="container-page grid gap-6 py-12 lg:grid-cols-2"><Skeleton className="aspect-[4/3] w-full" /><div className="space-y-4"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-32 w-full" /></div></div>;
  if (!p) return (
    <div className="container-page py-12">
      <Seo title="Package not found" noindex />
      <EmptyState icon={<Map className="h-6 w-6" aria-hidden />} title="This package is not available" action={<Link to="/packages" className="btn-primary">View All Packages</Link>} />
    </div>
  );
  return (
    <div className="container-page py-8 sm:py-12">
      <Seo title={p.title} description={p.summary || undefined} />
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted"><Link to="/packages" className="link">Packages</Link> / <span aria-current="page">{p.title}</span></nav>
      <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
        <ImageBox src={publicImageUrl('website-assets', p.image_path)} alt={p.title} placeholder={p.package_type || 'Package'} ratio="aspect-[4/3]" rounded="rounded-xl" className="border border-line" eager />
        <div>
          <h1 className="text-[28px] leading-tight sm:text-4xl">{p.title}</h1>
          {p.summary && <p className="mt-3 text-[15px] leading-relaxed text-muted">{p.summary}</p>}
          <dl className="mt-5 divide-y divide-line border-y border-line text-sm">
            {p.package_type && <div className="flex justify-between gap-4 py-3"><dt className="text-muted">Type</dt><dd className="font-semibold">{p.package_type}</dd></div>}
            {p.duration && <div className="flex justify-between gap-4 py-3"><dt className="text-muted">Duration</dt><dd className="font-semibold">{p.duration}</dd></div>}
            {p.route && <div className="flex justify-between gap-4 py-3"><dt className="text-muted">Route</dt><dd className="text-right font-semibold">{p.route}</dd></div>}
            <div className="flex justify-between gap-4 py-3"><dt className="text-muted">Price</dt><dd className="font-semibold">{p.price_label || 'Available on enquiry'}</dd></div>
          </dl>
          <Button className="mt-6 w-full sm:w-auto" onClick={() => setEnquiry({ kind: 'package', id: p.id, title: p.title })}>Enquire About Package</Button>
        </div>
      </div>
      {(p.itinerary || p.inclusions) && (
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {p.itinerary && <section className="card p-5"><h2 className="mb-2 text-base">Itinerary</h2><p className="whitespace-pre-line text-sm leading-relaxed text-muted">{p.itinerary}</p></section>}
          {p.inclusions && <section className="card p-5"><h2 className="mb-2 text-base">Inclusions</h2><p className="whitespace-pre-line text-sm leading-relaxed text-muted">{p.inclusions}</p></section>}
        </div>
      )}
      <EnquiryDialog subject={enquiry} onClose={() => setEnquiry(null)} />
    </div>
  );
}
