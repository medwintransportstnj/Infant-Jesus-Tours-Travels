-- =====================================================================
-- Customer accounts, booking ownership and customer notifications.
-- Additive: nothing in the earlier migrations is rewritten or dropped.
-- Identity is always the Supabase Auth user (auth.uid()). Phone is profile
-- data only — it is never used to sign anyone in or to merge accounts.
-- =====================================================================

-- ---------- profiles: phone ----------
alter table public.profiles
  add column if not exists phone text not null default ''
  check (phone = '' or phone ~ '^\+?[0-9][0-9 \-]{7,18}$');
-- last 10 digits = the comparable form of an Indian number, whatever prefix was typed
create index if not exists profiles_phone_norm_idx
  on public.profiles (right(regexp_replace(phone, '\D', '', 'g'), 10)) where phone <> '';

-- New auth users: copy name + phone from the sign-up metadata (validated; bad values are dropped, not trusted).
-- An existing profile is never overwritten here — only its email is kept in sync.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name  text := public.clean_text(new.raw_user_meta_data ->> 'full_name', 120);
  v_phone text := public.clean_text(new.raw_user_meta_data ->> 'phone', 20);
begin
  if v_phone is null or v_phone !~ '^\+?[0-9][0-9 \-]{7,18}$' then v_phone := ''; end if;
  insert into public.profiles (id, email, full_name, phone)
  values (new.id, lower(coalesce(new.email, '')), coalesce(v_name, ''), v_phone)
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

-- A signed-in user may edit only their own name and phone (the row is limited by the existing
-- "profiles: update own name" policy; the columns are limited here). Email changes go through Supabase Auth.
grant update (full_name, phone) on public.profiles to authenticated;

-- ---------- bookings: ownership ----------
alter table public.bookings
  add column if not exists customer_id uuid references public.profiles (id) on delete set null;
create index if not exists bookings_customer_idx on public.bookings (customer_id, created_at desc);

-- Ownership is derived from the caller's JWT inside the database. Whatever a client puts in the
-- payload is ignored, so a booking can never be assigned to someone else's account.
create or replace function public.bookings_set_customer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.customer_id := (select p.id from public.profiles p where p.id = (select auth.uid()));
  return new;
end $$;
drop trigger if exists bookings_set_customer on public.bookings;
create trigger bookings_set_customer before insert on public.bookings
  for each row execute function public.bookings_set_customer();

-- Extend the existing update guard: the owner of a booking cannot be reassigned, by anyone.
-- (It may still become NULL — that is how "on delete set null" works when an account is deleted.)
create or replace function public.bookings_before_update()
returns trigger language plpgsql set search_path = public as $$
begin
  new.reference  := old.reference;
  new.created_at := old.created_at;
  new.idempotency_key := old.idempotency_key;
  if new.customer_id is not null then new.customer_id := old.customer_id; end if;
  new.updated_at := now();
  return new;
end $$;

-- Customers may READ their own bookings. There is still no customer insert/update/delete policy:
-- creation stays inside create_booking(), and status changes stay with admins.
create policy "bookings: customer read own" on public.bookings
  for select to authenticated using (customer_id = (select auth.uid()));

-- ---------- customer notifications ----------
create table if not exists public.customer_notifications (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.profiles (id) on delete cascade,
  booking_id   uuid references public.bookings (id) on delete cascade,
  kind         text not null check (kind in ('booking', 'status')),
  title        text not null,
  body         text not null default '',
  is_read      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists customer_notifications_owner_idx
  on public.customer_notifications (customer_id, is_read, created_at desc);
create trigger customer_notifications_updated before update on public.customer_notifications
  for each row execute function public.set_updated_at();

alter table public.customer_notifications enable row level security;
revoke all on public.customer_notifications from anon, authenticated;
grant select on public.customer_notifications to authenticated;
grant update (is_read) on public.customer_notifications to authenticated;  -- read state only; title/body are immutable to clients
create policy "customer_notifications: read own" on public.customer_notifications
  for select to authenticated using (customer_id = (select auth.uid()));
create policy "customer_notifications: mark own read" on public.customer_notifications
  for update to authenticated using (customer_id = (select auth.uid())) with check (customer_id = (select auth.uid()));
-- No anon policy, no insert/delete policy, and no admin policy: these rows are private to the customer
-- and are written only by the triggers below.

create or replace function public.customer_status_message(p_reference text, p_status public.booking_status)
returns text language sql immutable set search_path = public as $$
  select case p_status
    when 'Pending'        then 'Your booking ' || p_reference || ' is pending review.'
    when 'Office Calling' then 'Our office is calling regarding booking ' || p_reference || '.'
    when 'Confirmed'      then 'Your booking ' || p_reference || ' has been confirmed.'
    when 'Trip Completed' then 'Booking ' || p_reference || ' has been marked as completed.'
  end
$$;

-- New booking by a signed-in customer -> "Booking Request Received".
create or replace function public.notify_customer_new_booking()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.customer_id is not null then
    insert into public.customer_notifications (customer_id, booking_id, kind, title, body)
    values (new.customer_id, new.id, 'booking',
      case when new.request_type = 'Vehicle Booking' then 'Booking Request Received' else 'Request Received' end,
      'We received your ' || lower(new.request_type::text) || ' ' || new.reference || '. It is pending review.');
  end if;
  return new;
end $$;
drop trigger if exists bookings_notify_customer on public.bookings;
create trigger bookings_notify_customer after insert on public.bookings
  for each row execute function public.notify_customer_new_booking();

-- Status change -> one admin notification and (if the booking has an owner) one customer notification.
-- Done in a trigger so no code path can change a status without notifying.
create or replace function public.notify_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (kind, title, body, booking_id)
  values ('status', 'Booking Status Updated · ' || new.reference,
          new.reference || ' (' || new.customer_name || ') changed from ' || old.status || ' to ' || new.status || '.', new.id);
  if new.customer_id is not null then
    insert into public.customer_notifications (customer_id, booking_id, kind, title, body)
    values (new.customer_id, new.id, 'status', 'Booking Status Updated',
            public.customer_status_message(new.reference, new.status));
  end if;
  return new;
end $$;
drop trigger if exists bookings_notify_status on public.bookings;
create trigger bookings_notify_status after update of status on public.bookings
  for each row when (old.status is distinct from new.status)
  execute function public.notify_status_change();

-- None of the functions above is callable through the API.
revoke all on function public.bookings_set_customer() from public, anon, authenticated;
revoke all on function public.notify_customer_new_booking() from public, anon, authenticated;
revoke all on function public.notify_status_change() from public, anon, authenticated;
revoke all on function public.customer_status_message(text, public.booking_status) from public, anon, authenticated;

-- ---------- realtime ----------
-- Realtime applies RLS per subscriber: a customer's socket receives only their own
-- notifications and their own bookings (bookings is already in the publication).
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'customer_notifications') then
    alter publication supabase_realtime add table public.customer_notifications;
  end if;
end $$;
alter table public.customer_notifications replica identity full;
