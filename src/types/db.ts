// Row shapes for the Supabase tables defined in supabase/migrations.

export type BookingStatus = 'Pending' | 'Office Calling' | 'Confirmed' | 'Trip Completed';
export type RequestType = 'Vehicle Booking' | 'Instant Ride' | 'Offer Enquiry' | 'Package Enquiry';
export type ThemeMode = 'light' | 'dark';
export type SocialPlatform = 'whatsapp' | 'facebook' | 'instagram' | 'youtube' | 'linkedin';
export type GallerySection = 'gallery' | 'landing' | 'fleet' | 'destinations' | 'packages';
export type AdminRole = 'owner' | 'admin';

export const BOOKING_STATUSES: BookingStatus[] = ['Pending', 'Office Calling', 'Confirmed', 'Trip Completed'];
export const REQUEST_TYPES: RequestType[] = ['Vehicle Booking', 'Instant Ride', 'Offer Enquiry', 'Package Enquiry'];
export const GALLERY_SECTIONS: { id: GallerySection; label: string }[] = [
  { id: 'gallery', label: 'Website Gallery' },
  { id: 'landing', label: 'Landing Page (hero)' },
  { id: 'fleet', label: 'Our Fleet section' },
  { id: 'destinations', label: 'Destinations section' },
  { id: 'packages', label: 'Packages section' },
];

interface Timestamps { created_at: string; updated_at: string }

export interface SiteSettings extends Timestamps {
  id: number; company_name: string; tagline: string; address: string; phone: string; email: string;
  map_embed_url: string; logo_main_path: string | null; logo_secondary_path: string | null; default_theme: ThemeMode;
}
export interface SeoSettings extends Timestamps {
  id: number; title: string; description: string; keywords: string; og_title: string; og_description: string;
  og_image_path: string | null; canonical_url: string;
}
export interface SocialLink extends Timestamps { id: string; platform: SocialPlatform; value: string }
export interface PageContent extends Timestamps { slug: string; name: string; description: string; heading: string; body: string }
export interface VehicleCategory extends Timestamps { id: string; name: string; is_hidden: boolean; sort_order: number }
export interface Vehicle extends Timestamps {
  id: string; name: string; category_id: string | null; capacity: number; has_ac: boolean; price_label: string;
  description: string; image_path: string | null; is_active: boolean; sort_order: number;
}
export interface TourPackage extends Timestamps {
  id: string; title: string; package_type: string; summary: string; duration: string; route: string; price_label: string;
  itinerary: string; inclusions: string; image_path: string | null; is_published: boolean; sort_order: number;
}
export interface Destination extends Timestamps {
  id: string; name: string; description: string; distance_label: string; image_path: string | null;
  is_published: boolean; sort_order: number;
}
export interface Offer extends Timestamps { id: string; title: string; description: string; expires_on: string; is_enabled: boolean }
export interface GalleryItem extends Timestamps {
  id: string; image_path: string; caption: string; section: GallerySection; opacity: number; is_hidden: boolean; sort_order: number;
}
export interface Testimonial extends Timestamps { id: string; customer_name: string; rating: number; review: string; is_published: boolean }

export interface Booking extends Timestamps {
  id: string; reference: string; request_type: RequestType; status: BookingStatus;
  customer_name: string; phone: string; email: string | null;
  pickup: string | null; destination: string | null; dropoff: string | null;
  travel_date: string | null; travel_time: string | null; members: number | null;
  round_trip: boolean; return_date: string | null; return_time: string | null;
  ac_preferred: boolean | null; flexible_time: boolean; notes: string | null;
  customer_id: string | null; vehicle_id: string | null; vehicle_name: string | null; offer_id: string | null; package_id: string | null; subject_title: string | null;
}
/** What create_booking() returns to the customer — no internal ids. */
export type BookingReceipt = Pick<Booking,
  'reference' | 'request_type' | 'status' | 'customer_name' | 'phone' | 'email' | 'pickup' | 'destination' | 'dropoff' |
  'travel_date' | 'travel_time' | 'members' | 'round_trip' | 'return_date' | 'return_time' | 'ac_preferred' |
  'flexible_time' | 'notes' | 'vehicle_name' | 'subject_title' | 'created_at'>;

export interface ContactMessage extends Timestamps { id: string; name: string; email: string; phone: string | null; message: string; is_read: boolean }
export interface AppNotification extends Timestamps {
  id: string; kind: 'booking' | 'message' | 'status'; title: string; body: string; booking_id: string | null; message_id: string | null; is_read: boolean;
}
export interface AdminUser { user_id: string; email: string; full_name: string; role: AdminRole; created_at: string }
export interface DashboardStats {
  total_bookings: number; pending: number; office_calling: number; confirmed: number; completed: number;
  new_messages: number; active_vehicles: number; active_offers: number;
  daily: { day: string; total: number; confirmed: number }[];
}

/** A signed-in person (customer or admin). Identity is the Supabase Auth user; phone is profile data only. */
export interface Profile extends Timestamps { id: string; email: string; full_name: string; phone: string }
export type CustomerNotificationKind = 'booking' | 'status';
export interface CustomerNotification extends Timestamps {
  id: string; customer_id: string; booking_id: string | null; kind: CustomerNotificationKind; title: string; body: string; is_read: boolean;
}
/** Outcome of the automatic WhatsApp hand-off after a request is saved. */
export type WhatsAppLaunch = 'opened' | 'blocked' | 'unavailable';
