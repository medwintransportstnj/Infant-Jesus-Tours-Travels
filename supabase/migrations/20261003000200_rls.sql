-- =====================================================================
-- Row Level Security + privileges
-- Model: visitors may READ published content and may WRITE only through
-- the validated RPCs. Everything else requires a row in public.admins.
-- =====================================================================

-- ---------- privileges (defence in depth, on top of RLS) ----------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant usage on schema public to anon, authenticated;

-- public, read-only content
grant select on
  public.site_settings, public.seo_settings, public.social_links, public.page_content,
  public.vehicle_categories, public.vehicles, public.packages, public.destinations,
  public.offers, public.gallery_items, public.testimonials
to anon, authenticated;

-- signed-in users get table privileges; RLS then narrows them to admins
grant insert, update, delete on
  public.site_settings, public.seo_settings, public.social_links, public.page_content,
  public.vehicle_categories, public.vehicles, public.packages, public.destinations,
  public.offers, public.gallery_items, public.testimonials
to authenticated;
grant select, update, delete on public.bookings, public.contact_messages, public.notifications to authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
-- public.admins: no direct privileges at all. It is only reachable through the admin_* RPCs.

-- functions
grant execute on function public.create_booking(jsonb) to anon, authenticated;
grant execute on function public.create_contact_message(text, text, text, text) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.ist_today() to anon, authenticated;
grant execute on function public.admin_dashboard() to authenticated;
grant execute on function public.admin_list() to authenticated;
grant execute on function public.admin_grant(text, public.admin_role) to authenticated;
grant execute on function public.admin_revoke(uuid) to authenticated;

-- ---------- enable RLS everywhere ----------
alter table public.profiles            enable row level security;
alter table public.admins              enable row level security;
alter table public.site_settings       enable row level security;
alter table public.seo_settings        enable row level security;
alter table public.social_links        enable row level security;
alter table public.page_content        enable row level security;
alter table public.vehicle_categories  enable row level security;
alter table public.vehicles            enable row level security;
alter table public.packages            enable row level security;
alter table public.destinations        enable row level security;
alter table public.offers              enable row level security;
alter table public.gallery_items       enable row level security;
alter table public.testimonials        enable row level security;
alter table public.bookings            enable row level security;
alter table public.contact_messages    enable row level security;
alter table public.notifications       enable row level security;

-- ---------- profiles / admins ----------
create policy "profiles: read own or admin" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or (select public.is_admin()));
create policy "profiles: update own name" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- admins: RLS enabled with NO policies => nobody can read or write it directly.

-- ---------- public configuration: everyone reads, admins write ----------
create policy "site_settings: public read" on public.site_settings for select to anon, authenticated using (true);
create policy "site_settings: admin insert" on public.site_settings for insert to authenticated with check ((select public.is_admin()));
create policy "site_settings: admin update" on public.site_settings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "seo_settings: public read" on public.seo_settings for select to anon, authenticated using (true);
create policy "seo_settings: admin insert" on public.seo_settings for insert to authenticated with check ((select public.is_admin()));
create policy "seo_settings: admin update" on public.seo_settings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "social_links: public read" on public.social_links for select to anon, authenticated using (true);
create policy "social_links: admin insert" on public.social_links for insert to authenticated with check ((select public.is_admin()));
create policy "social_links: admin update" on public.social_links for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "social_links: admin delete" on public.social_links for delete to authenticated using ((select public.is_admin()));

create policy "page_content: public read" on public.page_content for select to anon, authenticated using (true);
create policy "page_content: admin insert" on public.page_content for insert to authenticated with check ((select public.is_admin()));
create policy "page_content: admin update" on public.page_content for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------- catalogue: visitors see only published rows ----------
create policy "vehicle_categories: public read visible" on public.vehicle_categories
  for select to anon, authenticated using (not is_hidden or (select public.is_admin()));
create policy "vehicle_categories: admin insert" on public.vehicle_categories for insert to authenticated with check ((select public.is_admin()));
create policy "vehicle_categories: admin update" on public.vehicle_categories for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "vehicle_categories: admin delete" on public.vehicle_categories for delete to authenticated using ((select public.is_admin()));

create policy "vehicles: public read active" on public.vehicles
  for select to anon, authenticated using (is_active or (select public.is_admin()));
create policy "vehicles: admin insert" on public.vehicles for insert to authenticated with check ((select public.is_admin()));
create policy "vehicles: admin update" on public.vehicles for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "vehicles: admin delete" on public.vehicles for delete to authenticated using ((select public.is_admin()));

create policy "packages: public read published" on public.packages
  for select to anon, authenticated using (is_published or (select public.is_admin()));
create policy "packages: admin insert" on public.packages for insert to authenticated with check ((select public.is_admin()));
create policy "packages: admin update" on public.packages for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "packages: admin delete" on public.packages for delete to authenticated using ((select public.is_admin()));

create policy "destinations: public read published" on public.destinations
  for select to anon, authenticated using (is_published or (select public.is_admin()));
create policy "destinations: admin insert" on public.destinations for insert to authenticated with check ((select public.is_admin()));
create policy "destinations: admin update" on public.destinations for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "destinations: admin delete" on public.destinations for delete to authenticated using ((select public.is_admin()));

-- expired or disabled offers are never sent to a visitor's browser
create policy "offers: public read live" on public.offers
  for select to anon, authenticated using ((is_enabled and expires_on >= public.ist_today()) or (select public.is_admin()));
create policy "offers: admin insert" on public.offers for insert to authenticated with check ((select public.is_admin()));
create policy "offers: admin update" on public.offers for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "offers: admin delete" on public.offers for delete to authenticated using ((select public.is_admin()));

create policy "gallery_items: public read visible" on public.gallery_items
  for select to anon, authenticated using (not is_hidden or (select public.is_admin()));
create policy "gallery_items: admin insert" on public.gallery_items for insert to authenticated with check ((select public.is_admin()));
create policy "gallery_items: admin update" on public.gallery_items for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "gallery_items: admin delete" on public.gallery_items for delete to authenticated using ((select public.is_admin()));

create policy "testimonials: public read published" on public.testimonials
  for select to anon, authenticated using (is_published or (select public.is_admin()));
create policy "testimonials: admin insert" on public.testimonials for insert to authenticated with check ((select public.is_admin()));
create policy "testimonials: admin update" on public.testimonials for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "testimonials: admin delete" on public.testimonials for delete to authenticated using ((select public.is_admin()));

-- ---------- operations: admins only. There is deliberately NO insert policy:
-- rows are created exclusively by create_booking / create_contact_message. ----------
create policy "bookings: admin read" on public.bookings for select to authenticated using ((select public.is_admin()));
create policy "bookings: admin update" on public.bookings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "bookings: admin delete" on public.bookings for delete to authenticated using ((select public.is_admin()));

create policy "contact_messages: admin read" on public.contact_messages for select to authenticated using ((select public.is_admin()));
create policy "contact_messages: admin update" on public.contact_messages for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "contact_messages: admin delete" on public.contact_messages for delete to authenticated using ((select public.is_admin()));

create policy "notifications: admin read" on public.notifications for select to authenticated using ((select public.is_admin()));
create policy "notifications: admin update" on public.notifications for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "notifications: admin delete" on public.notifications for delete to authenticated using ((select public.is_admin()));
