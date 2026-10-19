import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isSupabaseConfigured, siteClient as supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import { publicLoaders, type PublicTable } from '@/services/public';
import type {
  Destination, GalleryItem, GallerySection, Offer, PageContent, SeoSettings, SiteSettings, SocialPlatform,
  Testimonial, TourPackage, Vehicle, VehicleCategory,
} from '@/types/db';

interface SiteState {
  site_settings: SiteSettings | null;
  seo_settings: SeoSettings | null;
  social_links: { platform: SocialPlatform; value: string }[];
  page_content: PageContent[];
  vehicle_categories: VehicleCategory[];
  vehicles: Vehicle[];
  packages: TourPackage[];
  destinations: Destination[];
  offers: Offer[];
  gallery_items: GalleryItem[];
  testimonials: Testimonial[];
}
const EMPTY: SiteState = {
  site_settings: null, seo_settings: null, social_links: [], page_content: [], vehicle_categories: [], vehicles: [],
  packages: [], destinations: [], offers: [], gallery_items: [], testimonials: [],
};

export interface SiteData {
  loading: boolean;
  error: string | null;
  reload: () => void;
  settings: SiteSettings | null;
  seo: SeoSettings | null;
  social: Partial<Record<SocialPlatform, string>>;
  page: (slug: string) => PageContent | undefined;
  categories: VehicleCategory[];
  categoryName: (id: string | null) => string;
  vehicles: Vehicle[];
  packages: TourPackage[];
  destinations: Destination[];
  offers: Offer[];
  testimonials: Testimonial[];
  gallery: (section: GallerySection) => GalleryItem[];
}

const SiteDataContext = createContext<SiteData | null>(null);
const TABLES = Object.keys(publicLoaders) as PublicTable[];

export function SiteDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SiteState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(new Set<PublicTable>());
  const timer = useRef<number>();

  const loadAll = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); setError('The website is not connected to its database yet.'); return; }
    setLoading(true); setError(null);
    const results = await Promise.allSettled(TABLES.map((t) => publicLoaders[t]()));
    const next: Record<string, unknown> = {};
    let failure: unknown = null;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') next[TABLES[i]] = r.value;
      else failure = failure ?? r.reason;
    });
    setState((prev) => ({ ...prev, ...(next as Partial<SiteState>) }));
    if (failure) setError(friendlyError(failure, 'Some content could not be loaded. Please refresh the page.'));
    setLoading(false);
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // Realtime: when an admin edits content, refetch just the affected table (debounced) so
  // open visitor tabs update without a reload. RLS still applies to every refetch.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const flush = async () => {
      const tables = [...pending.current]; pending.current.clear();
      const results = await Promise.allSettled(tables.map((t) => publicLoaders[t]()));
      const next: Record<string, unknown> = {};
      results.forEach((r, i) => { if (r.status === 'fulfilled') next[tables[i]] = r.value; else console.error('[ijt] realtime refetch failed', tables[i], r.reason); });
      setState((prev) => ({ ...prev, ...(next as Partial<SiteState>) }));
    };
    let channel = supabase.channel('public-site-content');
    TABLES.forEach((table) => {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        pending.current.add(table);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void flush(), 400);
      });
    });
    channel.subscribe();
    return () => { window.clearTimeout(timer.current); void supabase.removeChannel(channel); };
  }, []);

  const value = useMemo<SiteData>(() => {
    const social: Partial<Record<SocialPlatform, string>> = {};
    state.social_links.forEach((l) => { if (l.value) social[l.platform] = l.value; });
    const cats = new Map(state.vehicle_categories.map((c) => [c.id, c.name]));
    return {
      loading, error, reload: () => void loadAll(),
      settings: state.site_settings, seo: state.seo_settings, social,
      page: (slug) => state.page_content.find((p) => p.slug === slug),
      categories: state.vehicle_categories,
      categoryName: (id) => (id ? cats.get(id) ?? '' : ''),
      vehicles: state.vehicles, packages: state.packages, destinations: state.destinations,
      offers: state.offers, testimonials: state.testimonials,
      gallery: (section) => state.gallery_items.filter((g) => g.section === section),
    };
  }, [state, loading, error, loadAll]);

  return <SiteDataContext.Provider value={value}>{children}</SiteDataContext.Provider>;
}

export function useSiteData(): SiteData {
  const ctx = useContext(SiteDataContext);
  if (!ctx) throw new Error('useSiteData must be used inside <SiteDataProvider>');
  return ctx;
}
