import { siteClient as supabase, timeoutSignal } from '@/lib/supabase';
import type {
  BookingReceipt, Destination, GalleryItem, Offer, PageContent, RequestType, SeoSettings, SiteSettings,
  SocialLink, Testimonial, TourPackage, Vehicle, VehicleCategory,
} from '@/types/db';

/** Throws on error so callers can never mistake a failure for an empty result. */
async function unwrap<T>(query: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw error;
  return data as T;
}

// Each loader is keyed by table name so a realtime event can refetch exactly one table.
export const publicLoaders = {
  site_settings: () => unwrap<SiteSettings | null>(supabase.from('site_settings').select('*').eq('id', 1).abortSignal(timeoutSignal()).maybeSingle()),
  seo_settings: () => unwrap<SeoSettings | null>(supabase.from('seo_settings').select('*').eq('id', 1).abortSignal(timeoutSignal()).maybeSingle()),
  social_links: () => unwrap<SocialLink[]>(supabase.from('social_links').select('*').abortSignal(timeoutSignal())),
  page_content: () => unwrap<PageContent[]>(supabase.from('page_content').select('*').abortSignal(timeoutSignal())),
  vehicle_categories: () => unwrap<VehicleCategory[]>(supabase.from('vehicle_categories').select('*').eq('is_hidden', false).order('sort_order').order('name').abortSignal(timeoutSignal())),
  vehicles: () => unwrap<Vehicle[]>(supabase.from('vehicles').select('*').eq('is_active', true).order('sort_order').order('capacity').abortSignal(timeoutSignal())),
  packages: () => unwrap<TourPackage[]>(supabase.from('packages').select('*').eq('is_published', true).order('sort_order').order('created_at').abortSignal(timeoutSignal())),
  destinations: () => unwrap<Destination[]>(supabase.from('destinations').select('*').eq('is_published', true).order('sort_order').order('name').abortSignal(timeoutSignal())),
  // RLS already hides disabled/expired offers; no client-side trust needed.
  offers: () => unwrap<Offer[]>(supabase.from('offers').select('*').eq('is_enabled', true).order('expires_on').abortSignal(timeoutSignal())),
  gallery_items: () => unwrap<GalleryItem[]>(supabase.from('gallery_items').select('*').eq('is_hidden', false).order('sort_order').order('created_at', { ascending: false }).abortSignal(timeoutSignal())),
  testimonials: () => unwrap<Testimonial[]>(supabase.from('testimonials').select('*').eq('is_published', true).order('created_at', { ascending: false }).abortSignal(timeoutSignal())),
} as const;
export type PublicTable = keyof typeof publicLoaders;

export interface BookingPayload {
  request_type: RequestType;
  name: string; phone: string; email?: string;
  pickup?: string; destination?: string; dropoff?: string;
  travel_date?: string; travel_time?: string; members?: string;
  round_trip?: boolean; return_date?: string; return_time?: string;
  ac_preferred?: boolean; flexible_time?: boolean; notes?: string;
  vehicle_id?: string | null; offer_id?: string; package_id?: string;
  /** One key per form attempt: a retry or double-click returns the same booking instead of creating another. */
  idempotency_key: string;
}

/** The reference number, status and timestamps are assigned by Postgres — never by this code. */
export async function createBooking(payload: BookingPayload): Promise<BookingReceipt> {
  const { data, error } = await supabase.rpc('create_booking', { payload }).abortSignal(timeoutSignal(20000));
  if (error) throw error;
  const receipt = data as BookingReceipt | null;
  if (!receipt?.reference) throw new Error('The server did not return a booking reference.');
  return receipt;
}

export async function createContactMessage(input: { name: string; email: string; message: string; phone?: string }): Promise<void> {
  const { error } = await supabase
    .rpc('create_contact_message', { p_name: input.name, p_email: input.email, p_message: input.message, p_phone: input.phone || null })
    .abortSignal(timeoutSignal(20000));
  if (error) throw error;
}
