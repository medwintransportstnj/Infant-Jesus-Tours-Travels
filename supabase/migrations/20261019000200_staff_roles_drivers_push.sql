-- =====================================================================
-- Staff roles, drivers, notifications for every role, and push delivery.
--
-- Roles (public.admins.role):
--   owner  -> everything, including website settings and staff management
--   admin  -> "Office staff": bookings, enquiries, messages and catalogue content
--   driver -> only the trips assigned to them
-- Customers are not in public.admins; they own their bookings via bookings.customer_id.
--
-- Additive: earlier migrations are not edited. Comparisons against the new
-- 'driver' enum value are written as role::text so this file is safe even if
-- applied in the same session as 20261019000100.
-- =====================================================================

-- ---------- role helpers ----------
-- is_admin() now means "office-level staff" (owner or office staff). Every existing policy that uses
-- it keeps working, and drivers — who also have a row in public.admins — get none of that access.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()) and a.role::text in ('owner', 'admin'))
$$;

create or replace function public.is_driver()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()) and a.role::text = 'driver')
$$;

-- The signed-in person's staff role, or NULL for customers and visitors. Used by the dashboard to pick a layout;
-- it grants nothing by itself — every table is still guarded by RLS.
create or replace function public.my_staff_role()
returns text language sql stable security definer set search_path = public as $$
  select a.role::text from public.admins a where a.user_id = (select auth.uid())
$$;

grant execute on function public.is_driver() to authenticated;
grant execute on function public.my_staff_role() to authenticated;

-- ---------- website settings: owner only ----------
-- Office staff keep bookings, messages and catalogue content (vehicles, packages, destinations,
-- offers, gallery, testimonials). Company details, WhatsApp/social links, SEO, theme and page text
-- become owner-only.
drop policy if exists "site_settings: admin insert" on public.site_settings;
drop policy if exists "site_settings: admin update" on public.site_settings;
create policy "site_settings: owner insert" on public.site_settings for insert to authenticated with check ((select public.is_owner()));
create policy "site_settings: owner update" on public.site_settings for update to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists "seo_settings: admin insert" on public.seo_settings;
drop policy if exists "seo_settings: admin update" on public.seo_settings;
create policy "seo_settings: owner insert" on public.seo_settings for insert to authenticated with check ((select public.is_owner()));
create policy "seo_settings: owner update" on public.seo_settings for update to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists "social_links: admin insert" on public.social_links;
drop policy if exists "social_links: admin update" on public.social_links;
drop policy if exists "social_links: admin delete" on public.social_links;
create policy "social_links: owner insert" on public.social_links for insert to authenticated with check ((select public.is_owner()));
create policy "social_links: owner update" on public.social_links for update to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));
create policy "social_links: owner delete" on public.social_links for delete to authenticated using ((select public.is_owner()));

drop policy if exists "page_content: admin insert" on public.page_content;
drop policy if exists "page_content: admin update" on public.page_content;
create policy "page_content: owner insert" on public.page_content for insert to authenticated with check ((select public.is_owner()));
create policy "page_content: owner update" on public.page_content for update to authenticated using ((select public.is_owner())) with check ((select public.is_owner()));

-- ---------- staff management ----------
-- admin_list gains phone (the office needs a driver's number); return type changes, so drop first.
drop function if exists public.admin_list();
create function public.admin_list()
returns table (user_id uuid, email text, full_name text, phone text, role text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorised.' using errcode = '42501';
  end if;
  return query
    select a.user_id, p.email, p.full_name, p.phone, a.role::text, a.created_at
    from public.admins a join public.profiles p on p.id = a.user_id
    order by a.role::text = 'driver', a.created_at;
end $$;
revoke all on function public.admin_list() from public, anon;
grant execute on function public.admin_list() to authenticated;

-- Owners can set a staff member's display name and phone (drivers rarely set up their own profile).
create or replace function public.admin_update_staff(p_user_id uuid, p_full_name text, p_phone text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_name  text := public.clean_text(p_full_name, 120);
  v_phone text := public.clean_text(p_phone, 20);
begin
  if not public.is_owner() then
    raise exception 'Only an owner can edit staff details.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.admins where user_id = p_user_id) then
    raise exception 'That person is not a staff member.' using errcode = 'P0001';
  end if;
  if v_phone is not null and v_phone !~ '^\+?[0-9][0-9 \-]{7,18}$' then
    raise exception 'Please enter a valid phone number.' using errcode = 'P0001';
  end if;
  update public.profiles set full_name = coalesce(v_name, ''), phone = coalesce(v_phone, '') where id = p_user_id;
end $$;
revoke all on function public.admin_update_staff(uuid, text, text) from public, anon;
grant execute on function public.admin_update_staff(uuid, text, text) to authenticated;

-- ---------- bookings: driver assignment ----------
alter table public.bookings
  add column if not exists driver_id uuid references public.profiles (id) on delete set null;
create index if not exists bookings_driver_idx on public.bookings (driver_id, travel_date);

-- Only an actual driver can be assigned. (Who may assign is decided by RLS: office-level staff only.)
create or replace function public.bookings_check_driver()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.driver_id is not null
     and (tg_op = 'INSERT' or new.driver_id is distinct from old.driver_id)
     and not exists (select 1 from public.admins a where a.user_id = new.driver_id and a.role::text = 'driver') then
    raise exception 'That person is not a driver. Add them as a driver in Admin Management first.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists bookings_check_driver on public.bookings;
create trigger bookings_check_driver before insert or update of driver_id on public.bookings
  for each row execute function public.bookings_check_driver();

-- A driver can read the trips assigned to them — nothing else. Revoking the driver role removes access at once.
create policy "bookings: driver read assigned" on public.bookings
  for select to authenticated using (driver_id = (select auth.uid()) and (select public.is_driver()));

-- Drivers cannot UPDATE bookings directly. Their one action — finishing a confirmed trip — goes through here.
create or replace function public.driver_complete_trip(p_booking_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_row public.bookings%rowtype;
begin
  if not public.is_driver() then
    raise exception 'Only drivers can complete trips.' using errcode = '42501';
  end if;
  select * into v_row from public.bookings where id = p_booking_id and driver_id = auth.uid() for update;
  if not found then
    raise exception 'This trip is not assigned to you.' using errcode = '42501';
  end if;
  if v_row.status = 'Trip Completed' then
    return v_row.status::text;
  end if;
  if v_row.status <> 'Confirmed' then
    raise exception 'Only confirmed trips can be marked as completed.' using errcode = 'P0001';
  end if;
  update public.bookings set status = 'Trip Completed' where id = p_booking_id;
  return 'Trip Completed';
end $$;
revoke all on function public.driver_complete_trip(uuid) from public, anon;
grant execute on function public.driver_complete_trip(uuid) to authenticated;

-- ---------- notification tables ----------
-- Who caused an event. Filled from the caller's JWT, so a person's own actions can be shown to them
-- quietly (no chime, no push to themselves).
alter table public.notifications add column if not exists actor_id uuid default auth.uid();
alter table public.customer_notifications add column if not exists actor_id uuid default auth.uid();

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('booking', 'message', 'status', 'assignment'));
alter table public.customer_notifications drop constraint if exists customer_notifications_kind_check;
alter table public.customer_notifications add constraint customer_notifications_kind_check check (kind in ('booking', 'status', 'driver'));

create table if not exists public.driver_notifications (
  id          uuid primary key default gen_random_uuid(),
  driver_id   uuid not null references public.profiles (id) on delete cascade,
  booking_id  uuid references public.bookings (id) on delete set null,
  kind        text not null check (kind in ('assigned', 'unassigned', 'updated', 'status')),
  title       text not null,
  body        text not null default '',
  is_read     boolean not null default false,
  actor_id    uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists driver_notifications_owner_idx on public.driver_notifications (driver_id, is_read, created_at desc);
drop trigger if exists driver_notifications_updated on public.driver_notifications;
create trigger driver_notifications_updated before update on public.driver_notifications
  for each row execute function public.set_updated_at();

alter table public.driver_notifications enable row level security;
revoke all on public.driver_notifications from anon, authenticated;
grant select on public.driver_notifications to authenticated;
grant update (is_read) on public.driver_notifications to authenticated;
create policy "driver_notifications: read own" on public.driver_notifications
  for select to authenticated using (driver_id = (select auth.uid()));
create policy "driver_notifications: mark own read" on public.driver_notifications
  for update to authenticated using (driver_id = (select auth.uid())) with check (driver_id = (select auth.uid()));

-- ---------- trip notifications ----------
create or replace function public.trip_summary(b public.bookings)
returns text language sql stable set search_path = public as $$
  select case
    when b.request_type = 'Vehicle Booking' then
      coalesce(b.pickup, '') || ' to ' || coalesce(b.destination, '') ||
      coalesce(', ' || to_char(b.travel_date, 'DD Mon') || ' at ' || to_char(b.travel_time, 'HH12:MI AM'), '') ||
      coalesce(', ' || b.members || ' passengers', '')
    when b.request_type = 'Instant Ride' then
      'Instant ride' || coalesce(' from ' || nullif(b.pickup, ''), '') || coalesce(' to ' || nullif(b.destination, ''), '')
    else coalesce(b.subject_title, b.request_type::text)
  end
$$;

create or replace function public.notify_trip_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_driver_name text;
  v_actor uuid := (select auth.uid());
begin
  -- Driver assignment changed: tell the old driver, the new driver, the office and the customer.
  if new.driver_id is distinct from old.driver_id then
    if old.driver_id is not null then
      insert into public.driver_notifications (driver_id, booking_id, kind, title, body)
      values (old.driver_id, new.id, 'unassigned', 'Trip removed · ' || new.reference,
              new.reference || ' is no longer assigned to you.');
    end if;
    if new.driver_id is not null then
      select nullif(full_name, '') into v_driver_name from public.profiles where id = new.driver_id;
      insert into public.driver_notifications (driver_id, booking_id, kind, title, body)
      values (new.driver_id, new.id, 'assigned', 'New trip assigned · ' || new.reference, public.trip_summary(new) || '.');
      if new.customer_id is not null then
        insert into public.customer_notifications (customer_id, booking_id, kind, title, body)
        values (new.customer_id, new.id, 'driver', 'Driver assigned',
                coalesce(v_driver_name || ' will drive your trip ' || new.reference || '.',
                         'A driver has been assigned to your booking ' || new.reference || '.'));
      end if;
    end if;
    insert into public.notifications (kind, title, body, booking_id)
    values ('assignment',
            case when new.driver_id is null then 'Driver removed · ' else 'Driver assigned · ' end || new.reference,
            case when new.driver_id is null then 'No driver is assigned to ' || new.reference || ' now.'
                 else coalesce(v_driver_name, 'A driver') || ' assigned to ' || new.reference || '.' end,
            new.id);
    return new;
  end if;

  -- Same driver: tell them when their trip changes (but not about changes they made themselves).
  if new.driver_id is not null and new.driver_id is distinct from v_actor then
    if new.status is distinct from old.status then
      insert into public.driver_notifications (driver_id, booking_id, kind, title, body)
      values (new.driver_id, new.id, 'status', 'Trip status updated · ' || new.reference,
              new.reference || ' is now ' || new.status || '.');
    elsif (new.pickup, new.destination, new.dropoff, new.travel_date, new.travel_time, new.members, new.round_trip, new.return_date, new.return_time, new.vehicle_name, new.notes)
          is distinct from
          (old.pickup, old.destination, old.dropoff, old.travel_date, old.travel_time, old.members, old.round_trip, old.return_date, old.return_time, old.vehicle_name, old.notes) then
      insert into public.driver_notifications (driver_id, booking_id, kind, title, body)
      values (new.driver_id, new.id, 'updated', 'Trip details changed · ' || new.reference, public.trip_summary(new) || '.');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists bookings_notify_trip on public.bookings;
create trigger bookings_notify_trip after update on public.bookings
  for each row execute function public.notify_trip_change();

-- A deleted booking that had a driver: let the driver know it is gone.
create or replace function public.notify_trip_deleted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.driver_id is not null then
    insert into public.driver_notifications (driver_id, booking_id, kind, title, body)
    values (old.driver_id, null, 'unassigned', 'Trip cancelled · ' || old.reference,
            old.reference || ' was removed by the office.');
  end if;
  return old;
end $$;
drop trigger if exists bookings_notify_trip_deleted on public.bookings;
create trigger bookings_notify_trip_deleted before delete on public.bookings
  for each row execute function public.notify_trip_deleted();

revoke all on function public.bookings_check_driver() from public, anon, authenticated;
revoke all on function public.notify_trip_change() from public, anon, authenticated;
revoke all on function public.notify_trip_deleted() from public, anon, authenticated;
revoke all on function public.trip_summary(public.bookings) from public, anon, authenticated;

-- ---------- push subscriptions ----------
-- One row per (browser, person). The same browser can hold a staff login and a customer login; each
-- person gets their own pushes, and signing out removes that person's row.
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  endpoint    text not null check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh      text not null check (char_length(p256dh) between 20 and 200),
  auth        text not null check (char_length(auth) between 10 and 100),
  user_agent  text not null default '' check (char_length(user_agent) <= 300),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (endpoint, user_id)
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
-- No policies: browsers manage only their own rows, through the two functions below.

create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Please sign in to turn on notifications.' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 300))
  on conflict (endpoint, user_id) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent, updated_at = now();
end $$;

create or replace function public.push_unsubscribe(p_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end $$;

create or replace function public.push_is_subscribed(p_endpoint text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.push_subscriptions where endpoint = p_endpoint and user_id = (select auth.uid()))
$$;

revoke all on function public.push_subscribe(text, text, text, text) from public, anon;
revoke all on function public.push_unsubscribe(text) from public, anon;
revoke all on function public.push_is_subscribed(text) from public, anon;
grant execute on function public.push_subscribe(text, text, text, text) to authenticated;
grant execute on function public.push_unsubscribe(text) to authenticated;
grant execute on function public.push_is_subscribed(text) to authenticated;

-- ---------- push dispatch ----------
-- After each notification row, ask the push-dispatch Edge Function to deliver it to the recipients'
-- devices. Recipients are decided HERE (database = authority), never by the function or a browser.
-- Needs two Vault secrets (see README): push_dispatch_url and push_dispatch_secret. Without them,
-- or if anything at all goes wrong, notifications are still saved and still arrive live — push is skipped.
do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net is not available here; push delivery will be skipped (%).', sqlerrm;
end $$;

create or replace function public.queue_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_url        text;
  v_secret     text;
  v_recipients uuid[];
  v_link       text;
  v_ref        text := substring(new.title from 'IJT-[0-9]+');
begin
  if tg_table_name = 'notifications' then
    -- Every owner and office-staff member, except whoever caused the event.
    select array_agg(a.user_id) into v_recipients
    from public.admins a
    where a.role::text in ('owner', 'admin') and a.user_id is distinct from new.actor_id;
    v_link := case
      when new.kind = 'message' then '/admin/contacts'
      when v_ref is not null then '/admin/bookings?q=' || v_ref
      else '/admin/notifications' end;
  elsif tg_table_name = 'customer_notifications' then
    if new.customer_id is not distinct from new.actor_id then return new; end if;
    v_recipients := array[new.customer_id];
    v_link := '/account';
  elsif tg_table_name = 'driver_notifications' then
    if new.driver_id is not distinct from new.actor_id then return new; end if;
    v_recipients := array[new.driver_id];
    v_link := '/admin/trips';
  else
    return new;
  end if;

  if v_recipients is null or cardinality(v_recipients) = 0 then return new; end if;
  -- Only bother the Edge Function when at least one recipient has a device registered.
  if not exists (select 1 from public.push_subscriptions where user_id = any (v_recipients)) then return new; end if;

  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_url using 'push_dispatch_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_secret using 'push_dispatch_secret';
  if v_url is null or v_secret is null then return new; end if;

  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 5000)'
    using v_url,
          jsonb_build_object('recipients', to_jsonb(v_recipients), 'title', new.title, 'body', new.body,
                             'url', v_link, 'tag', tg_table_name || ':' || coalesce(new.booking_id::text, new.id::text)),
          jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret);
  return new;
exception when others then
  raise warning 'push dispatch skipped: %', sqlerrm;
  return new;
end $$;
revoke all on function public.queue_push() from public, anon, authenticated;

drop trigger if exists notifications_queue_push on public.notifications;
create trigger notifications_queue_push after insert on public.notifications
  for each row execute function public.queue_push();
drop trigger if exists customer_notifications_queue_push on public.customer_notifications;
create trigger customer_notifications_queue_push after insert on public.customer_notifications
  for each row execute function public.queue_push();
drop trigger if exists driver_notifications_queue_push on public.driver_notifications;
create trigger driver_notifications_queue_push after insert on public.driver_notifications
  for each row execute function public.queue_push();

-- ---------- realtime ----------
-- Re-assert every live table (safe to repeat). If 20261003000400/500 were never applied to the
-- live project, this alone switches live updates on.
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array[
    'bookings', 'contact_messages', 'notifications', 'customer_notifications', 'driver_notifications',
    'site_settings', 'seo_settings', 'social_links', 'page_content',
    'vehicle_categories', 'vehicles', 'packages', 'destinations', 'offers', 'gallery_items', 'testimonials'
  ] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
alter table public.driver_notifications replica identity full;
