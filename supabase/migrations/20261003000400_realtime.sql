-- =====================================================================
-- Realtime: broadcast row changes. Realtime applies RLS per subscriber,
-- so a visitor's socket can never receive bookings or messages.
-- =====================================================================
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array[
    'bookings', 'contact_messages', 'notifications',
    'site_settings', 'seo_settings', 'social_links', 'page_content',
    'vehicle_categories', 'vehicles', 'packages', 'destinations', 'offers', 'gallery_items', 'testimonials'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- DELETE events need the old row's id to reach subscribers under RLS.
alter table public.bookings          replica identity full;
alter table public.contact_messages  replica identity full;
alter table public.notifications     replica identity full;
