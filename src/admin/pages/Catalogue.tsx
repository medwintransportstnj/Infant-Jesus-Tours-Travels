import { useMemo, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Plus, Snowflake, Star, Users, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { ImageBox } from '@/components/ui/Feedback';
import { publicImageUrl } from '@/lib/supabase';
import { daysLeft, formatDate } from '@/utils/format';
import { GALLERY_SECTIONS, type Destination, type GalleryItem, type GallerySection, type Offer, type Testimonial, type TourPackage, type Vehicle, type VehicleCategory } from '@/types/db';
import { ResourcePage, type ResourceConfig } from '../components/ResourcePage';
import { useApiError, useTable } from '../data';

type R<T> = T & Record<string, unknown>;

function Card({ image, children }: { image?: React.ReactNode; children: React.ReactNode }) {
  return <article className="card flex h-full flex-col overflow-hidden">{image}<div className="flex flex-1 flex-col gap-2 p-4">{children}</div></article>;
}
function VisibilityButton({ hidden, onClick, disabled, label }: { hidden: boolean; onClick: () => void; disabled: boolean; label: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={!hidden} aria-label={`${hidden ? 'Show' : 'Hide'} ${label} on website`}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-line bg-card text-ink hover:bg-sunken disabled:opacity-50">
      {hidden ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
    </button>
  );
}

// ---------------- Vehicles ----------------
function VehicleCategories({ categories }: { categories: ReturnType<typeof useTable<R<VehicleCategory>>> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<VehicleCategory | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const toast = useToast();
  const apiError = useApiError();
  const add = async (e: FormEvent) => {
    e.preventDefault();
    const value = name.trim();
    if (!value || busy) return;
    setBusy(true);
    try { await categories.insert({ name: value, sort_order: categories.rows.length + 1 } as Partial<R<VehicleCategory>>); setName(''); toast.success('Category added'); }
    catch (err) { toast.error('Could not add category', apiError(err, 'Please try again.')); }
    finally { setBusy(false); }
  };
  const toggle = async (c: VehicleCategory) => {
    try { await categories.update(c.id, { is_hidden: !c.is_hidden } as Partial<R<VehicleCategory>>); }
    catch (err) { toast.error('Could not update category', apiError(err, 'Please try again.')); }
  };
  return (
    <section className="card mb-5 p-4" aria-labelledby="vcat-heading">
      <h2 id="vcat-heading" className="text-base">Vehicle categories</h2>
      <p className="mb-3 text-[13px] text-muted">Used for filtering on the website. Deleting a category leaves its vehicles uncategorised.</p>
      <form onSubmit={add} className="mb-3 flex gap-2">
        <label htmlFor="vcat-input" className="sr-only">New category name</label>
        <input id="vcat-input" className="input max-w-xs" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="New category name" />
        <Button type="submit" variant="secondary" loading={busy} icon={<Plus className="h-4 w-4" aria-hidden />}>Add</Button>
      </form>
      {categories.rows.length ? (
        <ul className="flex flex-wrap gap-2">
          {categories.rows.map((c) => (
            <li key={c.id} className={`inline-flex items-center gap-1 rounded-full border border-line bg-surface pl-3.5 text-sm ${c.is_hidden ? 'text-muted' : ''}`}>
              {c.name}{c.is_hidden && <span className="text-xs">(hidden)</span>}
              <button type="button" onClick={() => void toggle(c)} aria-label={`${c.is_hidden ? 'Show' : 'Hide'} category ${c.name}`} className="grid h-9 w-9 place-items-center rounded-full hover:bg-sunken">
                {c.is_hidden ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
              </button>
              <button type="button" onClick={() => { setDeleteError(null); setDeleting(c); }} aria-label={`Delete category ${c.name}`} className="-ml-1 grid h-9 w-9 place-items-center rounded-full text-danger hover:bg-danger-soft"><X className="h-3.5 w-3.5" aria-hidden /></button>
            </li>
          ))}
        </ul>
      ) : !categories.loading && <p className="text-sm text-muted">No categories yet — add one above (e.g. Sedan, SUV, Traveller).</p>}
      <ConfirmDialog open={deleting !== null} onCancel={() => setDeleting(null)} busy={deleteBusy} error={deleteError} title="Delete this category?"
        message="Vehicles in this category will become uncategorised. This cannot be undone."
        onConfirm={async () => {
          if (!deleting) return;
          setDeleteBusy(true); setDeleteError(null);
          try { await categories.remove(deleting.id); setDeleting(null); toast.success('Category deleted'); }
          catch (err) { setDeleteError(apiError(err, 'Could not delete. Check the connection and try again.')); }
          finally { setDeleteBusy(false); }
        }} />
    </section>
  );
}

export function VehiclesAdmin() {
  const categories = useTable<R<VehicleCategory>>('vehicle_categories', { orderBy: 'sort_order', ascending: true, thenBy: 'name' });
  const config = useMemo<ResourceConfig<R<Vehicle>>>(() => {
    const names = new Map(categories.rows.map((c) => [c.id, c.name]));
    return {
      table: 'vehicles', singular: 'Vehicle', orderBy: 'sort_order', ascending: true, thenBy: 'capacity',
      intro: 'Manage fleet content: capacity, AC, price label and availability. Inactive vehicles are hidden from the website and from booking.',
      emptyTitle: 'No vehicles yet', emptyBody: 'Add your first vehicle to show it on the website and in the booking flow.',
      image: { bucket: 'vehicle-images', folder: 'vehicles', label: 'Vehicle image' },
      defaults: { name: '', category_id: '', capacity: 4, has_ac: true, price_label: '', description: '', is_active: true, sort_order: 0 },
      fields: [
        { key: 'name', label: 'Vehicle name', type: 'text', required: true, maxLength: 80, placeholder: 'Enter verified name' },
        { key: 'category_id', label: 'Category', type: 'select', nullable: true, half: true, placeholder: 'Uncategorised', options: categories.rows.map((c) => ({ value: c.id, label: c.is_hidden ? `${c.name} (hidden)` : c.name })) },
        { key: 'capacity', label: 'Capacity (seats)', type: 'number', required: true, min: 1, max: 100, half: true },
        { key: 'price_label', label: 'Price label', type: 'text', maxLength: 60, placeholder: 'e.g. ₹14/km (optional)', half: true, hint: 'Leave blank to show "Available on enquiry".' },
        { key: 'sort_order', label: 'Display order', type: 'number', min: 0, max: 9999, half: true, hint: 'Lower numbers show first.' },
        { key: 'description', label: 'Description', type: 'textarea', maxLength: 1000, placeholder: 'Verified specifications (optional)' },
        { key: 'has_ac', label: 'Air conditioned', type: 'toggle', half: true },
        { key: 'is_active', label: 'Active', type: 'toggle', half: true, hint: 'Shown on the website' },
      ],
      header: <VehicleCategories categories={categories} />,
      renderCard: (v, actions, { patch, busy }) => (
        <Card image={<ImageBox src={publicImageUrl('vehicle-images', v.image_path)} alt="" placeholder="No image" ratio="aspect-[16/9]" />}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0"><h3 className="truncate text-base">{v.name}</h3><p className="text-[13px] text-muted">{(v.category_id && names.get(v.category_id)) || 'Uncategorised'}</p></div>
            <Badge tone={v.is_active ? 'success' : 'neutral'}>{v.is_active ? 'Active' : 'Inactive'}</Badge>
          </div>
          <p className="flex flex-wrap gap-x-4 text-[13px] text-muted">
            <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" aria-hidden />{v.capacity} seats</span>
            <span className="inline-flex items-center gap-1.5"><Snowflake className="h-3.5 w-3.5" aria-hidden />{v.has_ac ? 'AC' : 'Non-AC'}</span>
            <span>{v.price_label || 'Price on enquiry'}</span>
          </p>
          <div className="mt-auto flex items-center justify-end gap-1.5 pt-2">
            <VisibilityButton hidden={!v.is_active} disabled={busy} label={v.name} onClick={() => patch({ is_active: !v.is_active } as Partial<R<Vehicle>>, v.is_active ? 'Vehicle set to inactive' : 'Vehicle is now active')} />
            {actions}
          </div>
        </Card>
      ),
    };
  }, [categories]);
  return <ResourcePage config={config} />;
}

// ---------------- Packages ----------------
const packagesConfig: ResourceConfig<R<TourPackage>> = {
  table: 'packages', singular: 'Package', orderBy: 'sort_order', ascending: true, thenBy: 'created_at',
  intro: 'Publish trip types and tour packages. Only the title is required — add route, duration and itinerary when they are confirmed.',
  emptyTitle: 'No packages yet', emptyBody: 'Add a package or trip category to show it on the website.',
  image: { bucket: 'website-assets', folder: 'packages', label: 'Package image' },
  defaults: { title: '', package_type: '', summary: '', duration: '', route: '', price_label: '', itinerary: '', inclusions: '', is_published: true, sort_order: 0 },
  fields: [
    { key: 'title', label: 'Title', type: 'text', required: true, maxLength: 120 },
    { key: 'package_type', label: 'Type', type: 'text', maxLength: 60, half: true, placeholder: 'e.g. Pilgrimage, Family' },
    { key: 'duration', label: 'Duration', type: 'text', maxLength: 60, half: true, placeholder: 'e.g. 2 days / 1 night' },
    { key: 'route', label: 'Route', type: 'text', maxLength: 200, placeholder: 'e.g. Thanjavur → Velankanni → Thanjavur' },
    { key: 'price_label', label: 'Price label', type: 'text', maxLength: 60, half: true, hint: 'Blank shows "Available on enquiry".' },
    { key: 'sort_order', label: 'Display order', type: 'number', min: 0, max: 9999, half: true },
    { key: 'summary', label: 'Summary', type: 'textarea', maxLength: 400 },
    { key: 'itinerary', label: 'Itinerary', type: 'textarea', maxLength: 4000, placeholder: 'Day-by-day plan' },
    { key: 'inclusions', label: 'Inclusions', type: 'textarea', maxLength: 2000 },
    { key: 'is_published', label: 'Published', type: 'toggle', hint: 'Shown on the website' },
  ],
  renderCard: (p, actions, { patch, busy }) => (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><h3 className="text-base">{p.title}</h3><p className="text-[13px] text-muted">{[p.package_type, p.duration].filter(Boolean).join(' · ') || 'No type set'}</p></div>
        <Badge tone={p.is_published ? 'success' : 'neutral'}>{p.is_published ? 'Published' : 'Hidden'}</Badge>
      </div>
      {p.route && <p className="text-[13px] text-muted">{p.route}</p>}
      <div className="mt-auto flex justify-end gap-1.5 pt-2">
        <VisibilityButton hidden={!p.is_published} disabled={busy} label={p.title} onClick={() => patch({ is_published: !p.is_published } as Partial<R<TourPackage>>, p.is_published ? 'Package hidden' : 'Package published')} />
        {actions}
      </div>
    </Card>
  ),
};
export const PackagesAdmin = () => <ResourcePage config={packagesConfig} />;

// ---------------- Destinations ----------------
const destinationsConfig: ResourceConfig<R<Destination>> = {
  table: 'destinations', singular: 'Destination', orderBy: 'sort_order', ascending: true, thenBy: 'name',
  intro: 'Curate destination cards for the website: name, short description and distance.',
  emptyTitle: 'No destinations yet', emptyBody: 'Add the places your customers travel to most.',
  image: { bucket: 'website-assets', folder: 'destinations', label: 'Destination image' },
  defaults: { name: '', description: '', distance_label: '', is_published: true, sort_order: 0 },
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, maxLength: 120 },
    { key: 'description', label: 'Description', type: 'textarea', maxLength: 600 },
    { key: 'distance_label', label: 'Distance / details', type: 'text', maxLength: 60, half: true, placeholder: 'e.g. 90 km from Thanjavur' },
    { key: 'sort_order', label: 'Display order', type: 'number', min: 0, max: 9999, half: true },
    { key: 'is_published', label: 'Published', type: 'toggle', hint: 'Shown on the website' },
  ],
  renderCard: (d, actions) => (
    <Card>
      <div className="flex items-start justify-between gap-2"><h3 className="text-base">{d.name}</h3>{!d.is_published && <Badge>Hidden</Badge>}</div>
      {d.description && <p className="line-clamp-2 text-[13px] text-muted">{d.description}</p>}
      <div className="mt-auto flex items-center justify-between gap-2 pt-2"><span className="text-[13px] text-muted">{d.distance_label}</span>{actions}</div>
    </Card>
  ),
};
export const DestinationsAdmin = () => <ResourcePage config={destinationsConfig} />;

// ---------------- Offers ----------------
const offersConfig: ResourceConfig<R<Offer>> = {
  table: 'offers', singular: 'Offer', orderBy: 'expires_on', ascending: true,
  intro: 'Offers appear on the website only while enabled and before their expiry date. Publish only verified terms.',
  emptyTitle: 'No offers yet', emptyBody: 'The website shows "No offers available" until you add one.',
  defaults: { title: '', description: '', expires_on: '', is_enabled: true },
  fields: [
    { key: 'title', label: 'Title', type: 'text', required: true, maxLength: 120 },
    { key: 'description', label: 'Description', type: 'textarea', maxLength: 600 },
    { key: 'expires_on', label: 'Expiry date', type: 'date', required: true, half: true },
    { key: 'is_enabled', label: 'Enabled', type: 'toggle', half: true, hint: 'Shown on the website' },
  ],
  renderCard: (o, actions, { patch, busy }) => {
    const left = daysLeft(o.expires_on);
    return (
      <Card>
        <h3 className="text-base">{o.title}</h3>
        {o.description && <p className="line-clamp-3 text-[13px] text-muted">{o.description}</p>}
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={left > 0 ? 'accent' : 'danger'}>{left > 0 ? `${left} ${left === 1 ? 'day' : 'days'} left` : 'Expired'}</Badge>
          {!o.is_enabled && <Badge>Disabled</Badge>}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="text-[13px] text-muted">Ends {formatDate(o.expires_on)}</span>
          <div className="flex gap-1.5">
            <VisibilityButton hidden={!o.is_enabled} disabled={busy} label={o.title} onClick={() => patch({ is_enabled: !o.is_enabled } as Partial<R<Offer>>, o.is_enabled ? 'Offer disabled' : 'Offer enabled')} />
            {actions}
          </div>
        </div>
      </Card>
    );
  },
};
export const OffersAdmin = () => <ResourcePage config={offersConfig} />;

// ---------------- Testimonials ----------------
const testimonialsConfig: ResourceConfig<R<Testimonial>> = {
  table: 'testimonials', singular: 'Testimonial',
  intro: 'Publish genuine customer feedback only. Hidden testimonials stay saved but are not shown.',
  emptyTitle: 'No testimonials yet', emptyBody: 'The website shows an honest empty state until you add verified feedback.',
  defaults: { customer_name: '', rating: 5, review: '', is_published: true },
  fields: [
    { key: 'customer_name', label: 'Customer name', type: 'text', required: true, maxLength: 80, half: true },
    { key: 'rating', label: 'Rating (1–5)', type: 'number', required: true, min: 1, max: 5, half: true },
    { key: 'review', label: 'Review', type: 'textarea', required: true, maxLength: 1000 },
    { key: 'is_published', label: 'Published', type: 'toggle', hint: 'Shown on the website' },
  ],
  renderCard: (t, actions) => (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <span className="flex gap-0.5 text-accent" role="img" aria-label={`${t.rating} out of 5 stars`}>{Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`h-4 w-4 ${i < t.rating ? 'fill-current' : 'text-line'}`} aria-hidden />)}</span>
        {!t.is_published && <Badge>Hidden</Badge>}
      </div>
      <p className="line-clamp-4 text-[13px] text-muted">{t.review}</p>
      <div className="mt-auto flex items-center justify-between gap-2 pt-2"><span className="truncate text-sm font-semibold">{t.customer_name}</span>{actions}</div>
    </Card>
  ),
};
export const TestimonialsAdmin = () => <ResourcePage config={testimonialsConfig} />;

// ---------------- Gallery ----------------
export function GalleryAdmin() {
  const [tab, setTab] = useState<GallerySection | 'all'>('all');
  const config = useMemo<ResourceConfig<R<GalleryItem>>>(() => ({
    table: 'gallery_items', singular: 'Image', orderBy: 'sort_order', ascending: true, thenBy: 'created_at', saveLabel: 'Publish',
    intro: 'Upload journey photos and choose where each one appears: the gallery, the home page hero, or a section banner.',
    emptyTitle: 'No images yet', emptyBody: 'Upload your first photo to publish it on the website.',
    image: { bucket: 'gallery-images', folder: 'gallery', required: true, label: 'Image', opacityKey: 'opacity' },
    defaults: { caption: '', section: tab === 'all' ? 'gallery' : tab, opacity: 100, is_hidden: false, sort_order: 0 },
    fields: [
      { key: 'caption', label: 'Caption', type: 'text', maxLength: 160, hint: 'Also used as the image description for screen readers.' },
      { key: 'section', label: 'Display in', type: 'select', required: true, half: true, options: GALLERY_SECTIONS.map((s) => ({ value: s.id, label: s.label })) },
      { key: 'sort_order', label: 'Display order', type: 'number', min: 0, max: 9999, half: true },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 10, max: 100 },
      { key: 'is_hidden', label: 'Hide from website', type: 'toggle', hint: 'Keeps it saved, just not shown' },
    ],
    gridClass: 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4',
    filter: tab === 'all' ? undefined : (g) => g.section === tab,
    toolbar: (rows) => (
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Gallery sections">
        {[{ id: 'all' as const, label: 'All' }, ...GALLERY_SECTIONS].map((s) => {
          const count = rows.filter((g) => s.id === 'all' || g.section === s.id).length;
          return (
            <button key={s.id} type="button" role="tab" aria-selected={tab === s.id} onClick={() => setTab(s.id)}
              className={`min-h-11 shrink-0 rounded-full border px-4 text-[13px] font-semibold ${tab === s.id ? 'border-accent bg-accent text-white' : 'border-line bg-card text-ink hover:bg-sunken'}`}>
              {s.label} <span className="opacity-70">({count})</span>
            </button>
          );
        })}
      </div>
    ),
    renderCard: (g, actions, { patch, busy }) => (
      <article className={`card overflow-hidden ${g.is_hidden ? 'opacity-60' : ''}`}>
        <div className="relative">
          <ImageBox src={publicImageUrl('gallery-images', g.image_path)} alt={g.caption} opacity={g.opacity} ratio="aspect-square" />
          <span className="absolute left-2 top-2 rounded-full bg-inverse/75 px-2 py-0.5 text-[10px] font-semibold text-white">{GALLERY_SECTIONS.find((s) => s.id === g.section)?.label ?? g.section}</span>
        </div>
        <div className="p-2.5">
          <p className="mb-2 truncate text-[13px] font-medium">{g.caption || 'No caption'}{g.is_hidden && ' · Hidden'}</p>
          <div className="flex justify-end gap-1.5">
            <VisibilityButton hidden={g.is_hidden} disabled={busy} label={g.caption || 'image'} onClick={() => patch({ is_hidden: !g.is_hidden } as Partial<R<GalleryItem>>, g.is_hidden ? 'Image is now visible' : 'Image hidden')} />
            {actions}
          </div>
        </div>
      </article>
    ),
  }), [tab]);
  return <ResourcePage config={config} />;
}
