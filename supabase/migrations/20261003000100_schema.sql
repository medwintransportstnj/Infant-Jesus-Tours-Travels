-- =====================================================================
-- Infant Jesus Tours & Travels — core schema
-- Tables, constraints, indexes, triggers and server-side functions.
-- RLS lives in the next migration; nothing here is reachable until then.
-- =====================================================================

-- ---------- enums ----------
create type public.booking_status as enum ('Pending', 'Office Calling', 'Confirmed', 'Trip Completed');
create type public.request_type   as enum ('Vehicle Booking', 'Instant Ride', 'Offer Enquiry', 'Package Enquiry');
create type public.admin_role     as enum ('owner', 'admin');

-- ---------- helpers ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- India is the business timezone; "today" must not flip at UTC midnight.
create or replace function public.ist_today()
returns date language sql stable set search_path = public as $$
  select (now() at time zone 'Asia/Kolkata')::date
$$;

-- ---------- people ----------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '' check (char_length(full_name) <= 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));
create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.admins (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  role        public.admin_role not null default 'admin',
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Mirror every auth user into profiles (runs as definer; auth schema is not public).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;
create trigger on_auth_user_created after insert or update of email on auth.users
  for each row execute function public.handle_new_user();

-- The single authorisation predicate used by every policy.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()))
$$;
create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()) and a.role = 'owner')
$$;

-- ---------- site configuration (singletons) ----------
create table public.site_settings (
  id                  smallint primary key default 1 check (id = 1),
  company_name        text not null check (char_length(company_name) between 1 and 120),
  tagline             text not null default '' check (char_length(tagline) <= 200),
  address             text not null default '' check (char_length(address) <= 400),
  phone               text not null default '' check (phone = '' or phone ~ '^\+?[0-9][0-9 \-]{7,18}$'),
  email               text not null default '' check (email = '' or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  -- Only Google Maps embeds may be framed; anything else is rejected at the database.
  map_embed_url       text not null default '' check (map_embed_url = '' or map_embed_url ~ '^https://www\.google\.com/maps/embed\?'),
  logo_main_path      text,
  logo_secondary_path text,
  default_theme       text not null default 'light' check (default_theme in ('light', 'dark')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger site_settings_updated before update on public.site_settings
  for each row execute function public.set_updated_at();

create table public.seo_settings (
  id              smallint primary key default 1 check (id = 1),
  title           text not null default '' check (char_length(title) <= 120),
  description     text not null default '' check (char_length(description) <= 320),
  keywords        text not null default '' check (char_length(keywords) <= 400),
  og_title        text not null default '' check (char_length(og_title) <= 120),
  og_description  text not null default '' check (char_length(og_description) <= 320),
  og_image_path   text,
  canonical_url   text not null default '' check (canonical_url = '' or canonical_url ~ '^https://'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger seo_settings_updated before update on public.seo_settings
  for each row execute function public.set_updated_at();

create table public.social_links (
  id          uuid primary key default gen_random_uuid(),
  platform    text not null unique check (platform in ('whatsapp', 'facebook', 'instagram', 'youtube', 'linkedin')),
  value       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- WhatsApp is a phone number or a wa.me link; everything else must be https (blocks javascript: URLs).
  constraint social_value_safe check (
    value = ''
    or (platform = 'whatsapp' and (value ~ '^\+?[0-9][0-9 \-]{7,18}$' or value ~ '^https://(wa\.me|api\.whatsapp\.com)/'))
    or (platform <> 'whatsapp' and value ~ '^https://' and char_length(value) <= 300)
  )
);
create trigger social_links_updated before update on public.social_links
  for each row execute function public.set_updated_at();

create table public.page_content (
  slug        text primary key check (slug ~ '^[a-z0-9-]{1,40}$'),
  name        text not null,
  description text not null default '',
  heading     text not null default '' check (char_length(heading) <= 160),
  body        text not null default '' check (char_length(body) <= 4000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger page_content_updated before update on public.page_content
  for each row execute function public.set_updated_at();

-- ---------- catalogue ----------
create table public.vehicle_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  is_hidden   boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index vehicle_categories_name_key on public.vehicle_categories (lower(name));
create trigger vehicle_categories_updated before update on public.vehicle_categories
  for each row execute function public.set_updated_at();

create table public.vehicles (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 80),
  category_id  uuid references public.vehicle_categories (id) on delete set null,
  capacity     integer not null check (capacity between 1 and 100),
  has_ac       boolean not null default true,
  price_label  text not null default '' check (char_length(price_label) <= 60),
  description  text not null default '' check (char_length(description) <= 1000),
  image_path   text,
  is_active    boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index vehicles_active_capacity_idx on public.vehicles (is_active, capacity);
create index vehicles_category_idx on public.vehicles (category_id);
create trigger vehicles_updated before update on public.vehicles
  for each row execute function public.set_updated_at();

create table public.packages (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (char_length(title) between 1 and 120),
  package_type  text not null default '' check (char_length(package_type) <= 60),
  summary       text not null default '' check (char_length(summary) <= 400),
  duration      text not null default '' check (char_length(duration) <= 60),
  route         text not null default '' check (char_length(route) <= 200),
  price_label   text not null default '' check (char_length(price_label) <= 60),
  itinerary     text not null default '' check (char_length(itinerary) <= 4000),
  inclusions    text not null default '' check (char_length(inclusions) <= 2000),
  image_path    text,
  is_published  boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index packages_published_idx on public.packages (is_published, sort_order);
create trigger packages_updated before update on public.packages
  for each row execute function public.set_updated_at();

create table public.destinations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(name) between 1 and 120),
  description     text not null default '' check (char_length(description) <= 600),
  distance_label  text not null default '' check (char_length(distance_label) <= 60),
  image_path      text,
  is_published    boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index destinations_published_idx on public.destinations (is_published, sort_order);
create trigger destinations_updated before update on public.destinations
  for each row execute function public.set_updated_at();

create table public.offers (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 600),
  expires_on  date not null,
  is_enabled  boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index offers_live_idx on public.offers (is_enabled, expires_on);
create trigger offers_updated before update on public.offers
  for each row execute function public.set_updated_at();

create table public.gallery_items (
  id          uuid primary key default gen_random_uuid(),
  image_path  text not null,
  caption     text not null default '' check (char_length(caption) <= 160),
  section     text not null default 'gallery' check (section in ('gallery', 'landing', 'fleet', 'destinations', 'packages')),
  opacity     integer not null default 100 check (opacity between 10 and 100),
  is_hidden   boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index gallery_section_idx on public.gallery_items (section, is_hidden, sort_order);
create trigger gallery_items_updated before update on public.gallery_items
  for each row execute function public.set_updated_at();

create table public.testimonials (
  id             uuid primary key default gen_random_uuid(),
  customer_name  text not null check (char_length(customer_name) between 1 and 80),
  rating         integer not null default 5 check (rating between 1 and 5),
  review         text not null check (char_length(review) between 1 and 1000),
  is_published   boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger testimonials_updated before update on public.testimonials
  for each row execute function public.set_updated_at();

-- ---------- operations ----------
create sequence public.booking_reference_seq as bigint start 1 increment 1 no cycle;

create table public.bookings (
  id               uuid primary key default gen_random_uuid(),
  reference        text not null unique,
  request_type     public.request_type not null default 'Vehicle Booking',
  status           public.booking_status not null default 'Pending',
  customer_name    text not null check (char_length(customer_name) between 2 and 80),
  phone            text not null check (phone ~ '^\+?[0-9][0-9 \-]{7,18}$'),
  email            text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  pickup           text check (pickup is null or char_length(pickup) <= 160),
  destination      text check (destination is null or char_length(destination) <= 160),
  dropoff          text check (dropoff is null or char_length(dropoff) <= 160),
  travel_date      date,
  travel_time      time,
  members          integer check (members is null or members between 1 and 500),
  round_trip       boolean not null default false,
  return_date      date,
  return_time      time,
  ac_preferred     boolean,
  flexible_time    boolean not null default false,
  notes            text check (notes is null or char_length(notes) <= 1000),
  vehicle_id       uuid references public.vehicles (id) on delete set null,
  vehicle_name     text,           -- snapshot: survives later edits/deletes of the vehicle
  offer_id         uuid references public.offers (id) on delete set null,
  package_id       uuid references public.packages (id) on delete set null,
  subject_title    text,           -- snapshot of the offer/package the enquiry is about
  idempotency_key  uuid unique,    -- makes double-submits return the same booking
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint round_trip_has_return check (not round_trip or (return_date is not null and return_time is not null))
);
create index bookings_created_idx on public.bookings (created_at desc);
create index bookings_status_idx on public.bookings (status, created_at desc);
create index bookings_type_idx on public.bookings (request_type, created_at desc);
create index bookings_phone_idx on public.bookings (phone, created_at desc);

-- reference and created_at are authoritative: not even an admin UPDATE may alter them.
create or replace function public.bookings_before_update()
returns trigger language plpgsql set search_path = public as $$
begin
  new.reference  := old.reference;
  new.created_at := old.created_at;
  new.idempotency_key := old.idempotency_key;
  new.updated_at := now();
  return new;
end $$;
create trigger bookings_guard before update on public.bookings
  for each row execute function public.bookings_before_update();

create table public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 80),
  email       text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone       text check (phone is null or phone ~ '^\+?[0-9][0-9 \-]{7,18}$'),
  message     text not null check (char_length(message) between 2 and 2000),
  is_read     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index contact_messages_created_idx on public.contact_messages (created_at desc);
create trigger contact_messages_updated before update on public.contact_messages
  for each row execute function public.set_updated_at();

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('booking', 'message', 'status')),
  title       text not null,
  body        text not null default '',
  booking_id  uuid references public.bookings (id) on delete cascade,
  message_id  uuid references public.contact_messages (id) on delete cascade,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index notifications_unread_idx on public.notifications (is_read, created_at desc);
create trigger notifications_updated before update on public.notifications
  for each row execute function public.set_updated_at();

-- Notifications are produced by the database, never by a client.
create or replace function public.notify_new_booking()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (kind, title, body, booking_id)
  values (
    'booking',
    case new.request_type
      when 'Vehicle Booking' then 'New Booking Request'
      when 'Instant Ride'    then 'New Instant Ride Request'
      when 'Offer Enquiry'   then 'New Offer Enquiry'
      else 'New Package Enquiry'
    end || ' · ' || new.reference,
    case
      when new.request_type = 'Vehicle Booking'
        then new.customer_name || ' requested a vehicle from ' || new.pickup || ' to ' || new.destination || '.'
      when new.request_type = 'Instant Ride'
        then new.customer_name || ' requested an instant ride'
             || coalesce(' from ' || nullif(new.pickup, ''), '') || '.'
      else new.customer_name || ' enquired about ' || coalesce(nullif(new.subject_title, ''), 'an item') || '.'
    end,
    new.id
  );
  return new;
end $$;
create trigger bookings_notify after insert on public.bookings
  for each row execute function public.notify_new_booking();

create or replace function public.notify_new_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (kind, title, body, message_id)
  values ('message', 'New Contact Message', new.name || ' sent a message through the website.', new.id);
  return new;
end $$;
create trigger contact_messages_notify after insert on public.contact_messages
  for each row execute function public.notify_new_message();

-- =====================================================================
-- Public write path: the ONLY way an anonymous visitor can create rows.
-- Everything is validated here; the browser's validation is a courtesy.
-- =====================================================================
create or replace function public.clean_text(v text, max_len integer)
returns text language sql immutable set search_path = public as $$
  -- strip control characters, collapse runs of whitespace, trim, cap length
  select nullif(left(btrim(regexp_replace(regexp_replace(coalesce(v, ''), '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g'), '[ \t]+', ' ', 'g')), max_len), '')
$$;

create or replace function public.create_booking(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_type      public.request_type;
  v_name      text := public.clean_text(payload ->> 'name', 80);
  v_phone     text := public.clean_text(payload ->> 'phone', 20);
  v_email     text := public.clean_text(payload ->> 'email', 160);
  v_pickup    text := public.clean_text(payload ->> 'pickup', 160);
  v_dest      text := public.clean_text(payload ->> 'destination', 160);
  v_dropoff   text := public.clean_text(payload ->> 'dropoff', 160);
  v_notes     text := public.clean_text(payload ->> 'notes', 1000);
  v_round     boolean := coalesce(payload ->> 'round_trip', 'false') = 'true';
  v_flexible  boolean := coalesce(payload ->> 'flexible_time', 'false') = 'true';
  v_ac        boolean;
  v_date      date;
  v_time      time;
  v_rdate     date;
  v_rtime     time;
  v_members   integer;
  v_key       uuid;
  v_vehicle   public.vehicles%rowtype;
  v_offer_id  uuid;
  v_pkg_id    uuid;
  v_subject   text;
  v_row       public.bookings%rowtype;
  v_digits    integer;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'Invalid request.' using errcode = 'P0001';
  end if;

  -- type-safe parsing: bad formats become a friendly error, never a 500
  begin
    v_type    := coalesce(nullif(payload ->> 'request_type', ''), 'Vehicle Booking')::public.request_type;
    v_date    := nullif(payload ->> 'travel_date', '')::date;
    v_time    := nullif(payload ->> 'travel_time', '')::time;
    v_rdate   := nullif(payload ->> 'return_date', '')::date;
    v_rtime   := nullif(payload ->> 'return_time', '')::time;
    v_members := nullif(payload ->> 'members', '')::integer;
    v_key     := nullif(payload ->> 'idempotency_key', '')::uuid;
    v_offer_id := nullif(payload ->> 'offer_id', '')::uuid;
    v_pkg_id   := nullif(payload ->> 'package_id', '')::uuid;
    if payload ? 'ac_preferred' and payload ->> 'ac_preferred' is not null then
      v_ac := (payload ->> 'ac_preferred')::boolean;
    end if;
  exception when others then
    raise exception 'Some of the details are not in a valid format. Please check and try again.' using errcode = 'P0001';
  end;

  -- A retried submit (double click, flaky network) returns the original booking.
  if v_key is not null then
    select * into v_row from public.bookings where idempotency_key = v_key;
    if found then
      return public.booking_receipt(v_row);
    end if;
  end if;

  if v_name is null or char_length(v_name) < 2 then
    raise exception 'Please enter your full name.' using errcode = 'P0001';
  end if;
  v_digits := char_length(regexp_replace(coalesce(v_phone, ''), '\D', '', 'g'));
  if v_phone is null or v_phone !~ '^\+?[0-9][0-9 \-]{7,18}$' or v_digits < 10 or v_digits > 15 then
    raise exception 'Please enter a valid phone number.' using errcode = 'P0001';
  end if;
  if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please enter a valid email address.' using errcode = 'P0001';
  end if;

  if v_type = 'Vehicle Booking' then
    if v_pickup is null or char_length(v_pickup) < 2 then
      raise exception 'Please enter your pickup location.' using errcode = 'P0001';
    end if;
    if v_dest is null or char_length(v_dest) < 2 then
      raise exception 'Please enter your destination.' using errcode = 'P0001';
    end if;
    if v_date is null or v_time is null then
      raise exception 'Please choose your travel date and time.' using errcode = 'P0001';
    end if;
    if v_date < public.ist_today() then
      raise exception 'The travel date cannot be in the past.' using errcode = 'P0001';
    end if;
    if v_date > public.ist_today() + 730 then
      raise exception 'Please choose a travel date within the next two years.' using errcode = 'P0001';
    end if;
    if v_members is null or v_members < 1 or v_members > 500 then
      raise exception 'Please enter the number of members (1 to 500).' using errcode = 'P0001';
    end if;
    if v_round then
      if v_rdate is null or v_rtime is null then
        raise exception 'Please choose your return date and time.' using errcode = 'P0001';
      end if;
      if (v_rdate + v_rtime) <= (v_date + v_time) then
        raise exception 'The return must be after the pickup date and time.' using errcode = 'P0001';
      end if;
    else
      v_rdate := null; v_rtime := null;
    end if;
  else
    -- quick requests carry only what the customer chose to share
    v_round := false; v_rdate := null; v_rtime := null; v_date := null; v_time := null; v_members := null;
    if v_type <> 'Instant Ride' then v_pickup := null; v_dest := null; v_dropoff := null; end if;
  end if;

  -- The client only sends ids; names are looked up here so they cannot be spoofed.
  if payload ->> 'vehicle_id' is not null and payload ->> 'vehicle_id' <> '' and v_type = 'Vehicle Booking' then
    begin
      select * into v_vehicle from public.vehicles where id = (payload ->> 'vehicle_id')::uuid and is_active;
    exception when others then
      raise exception 'The selected vehicle is not valid.' using errcode = 'P0001';
    end;
    if not found then
      raise exception 'The selected vehicle is no longer available. Please choose another.' using errcode = 'P0001';
    end if;
  end if;

  if v_type = 'Offer Enquiry' then
    select title into v_subject from public.offers
      where id = v_offer_id and is_enabled and expires_on >= public.ist_today();
    if v_subject is null then
      raise exception 'This offer is no longer available.' using errcode = 'P0001';
    end if;
    v_pkg_id := null;
  elsif v_type = 'Package Enquiry' then
    select title into v_subject from public.packages where id = v_pkg_id and is_published;
    if v_subject is null then
      raise exception 'This package is no longer available.' using errcode = 'P0001';
    end if;
    v_offer_id := null;
  else
    v_offer_id := null; v_pkg_id := null;
  end if;

  -- Basic abuse throttle: one phone number cannot flood the office.
  if (select count(*) from public.bookings b
       where b.phone = v_phone and b.created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'We have already received several requests from this number. Please wait a few minutes or call us.' using errcode = 'P0001';
  end if;

  -- Reference is allocated last so failed validation never burns a number.
  insert into public.bookings (
    reference, request_type, customer_name, phone, email, pickup, destination, dropoff,
    travel_date, travel_time, members, round_trip, return_date, return_time,
    ac_preferred, flexible_time, notes, vehicle_id, vehicle_name, offer_id, package_id, subject_title, idempotency_key
  ) values (
    'IJT-' || lpad(nextval('public.booking_reference_seq')::text, 4, '0'),
    v_type, v_name, v_phone, v_email, v_pickup, v_dest, v_dropoff,
    v_date, v_time, v_members, v_round, v_rdate, v_rtime,
    v_ac, v_flexible, v_notes, v_vehicle.id, v_vehicle.name, v_offer_id, v_pkg_id, v_subject, v_key
  )
  returning * into v_row;

  return public.booking_receipt(v_row);
exception
  when unique_violation then
    -- two identical submits raced; hand back the winner
    select * into v_row from public.bookings where idempotency_key = v_key;
    if found then return public.booking_receipt(v_row); end if;
    raise;
end $$;

-- What a customer gets back: their own receipt, no internal ids.
create or replace function public.booking_receipt(b public.bookings)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'reference', b.reference, 'request_type', b.request_type, 'status', b.status,
    'customer_name', b.customer_name, 'phone', b.phone, 'email', b.email,
    'pickup', b.pickup, 'destination', b.destination, 'dropoff', b.dropoff,
    'travel_date', b.travel_date, 'travel_time', b.travel_time, 'members', b.members,
    'round_trip', b.round_trip, 'return_date', b.return_date, 'return_time', b.return_time,
    'ac_preferred', b.ac_preferred, 'flexible_time', b.flexible_time, 'notes', b.notes,
    'vehicle_name', b.vehicle_name, 'subject_title', b.subject_title, 'created_at', b.created_at
  )
$$;

create or replace function public.create_contact_message(p_name text, p_email text, p_message text, p_phone text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_name  text := public.clean_text(p_name, 80);
  v_email text := public.clean_text(p_email, 160);
  v_phone text := public.clean_text(p_phone, 20);
  v_msg   text := nullif(left(btrim(regexp_replace(coalesce(p_message, ''), '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g')), 2000), '');
begin
  if v_name is null or char_length(v_name) < 2 then
    raise exception 'Please enter your name.' using errcode = 'P0001';
  end if;
  if v_email is null or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please enter a valid email address.' using errcode = 'P0001';
  end if;
  if v_phone is not null and v_phone !~ '^\+?[0-9][0-9 \-]{7,18}$' then
    raise exception 'Please enter a valid phone number.' using errcode = 'P0001';
  end if;
  if v_msg is null or char_length(v_msg) < 2 then
    raise exception 'Please enter your message.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.contact_messages m
       where lower(m.email) = lower(v_email) and m.created_at > now() - interval '10 minutes') >= 3 then
    raise exception 'We have already received your messages. Please wait a few minutes before sending another.' using errcode = 'P0001';
  end if;
  insert into public.contact_messages (name, email, phone, message) values (v_name, v_email, v_phone, v_msg);
end $$;

-- =====================================================================
-- Admin RPCs
-- =====================================================================
create or replace function public.admin_dashboard()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorised.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'total_bookings',  (select count(*) from public.bookings),
    'pending',         (select count(*) from public.bookings where status = 'Pending'),
    'office_calling',  (select count(*) from public.bookings where status = 'Office Calling'),
    'confirmed',       (select count(*) from public.bookings where status = 'Confirmed'),
    'completed',       (select count(*) from public.bookings where status = 'Trip Completed'),
    'new_messages',    (select count(*) from public.contact_messages where not is_read),
    'active_vehicles', (select count(*) from public.vehicles where is_active),
    'active_offers',   (select count(*) from public.offers where is_enabled and expires_on >= public.ist_today()),
    'daily', (
      select jsonb_agg(jsonb_build_object('day', d.day, 'total', coalesce(c.total, 0), 'confirmed', coalesce(c.confirmed, 0)) order by d.day)
      from (select generate_series(public.ist_today() - 6, public.ist_today(), interval '1 day')::date as day) d
      left join (
        select (created_at at time zone 'Asia/Kolkata')::date as day,
               count(*) as total,
               count(*) filter (where status in ('Confirmed', 'Trip Completed')) as confirmed
        from public.bookings
        where created_at >= (public.ist_today() - 6)::timestamp at time zone 'Asia/Kolkata'
        group by 1
      ) c using (day)
    )
  ) into result;
  return result;
end $$;

create or replace function public.admin_list()
returns table (user_id uuid, email text, full_name text, role public.admin_role, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorised.' using errcode = '42501';
  end if;
  return query
    select a.user_id, p.email, p.full_name, a.role, a.created_at
    from public.admins a join public.profiles p on p.id = a.user_id
    order by a.created_at;
end $$;

-- Only an owner can grant admin access, and only to an account that already exists in Supabase Auth.
create or replace function public.admin_grant(p_email text, p_role public.admin_role default 'admin')
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_owner() then
    raise exception 'Only an owner can manage admin access.' using errcode = '42501';
  end if;
  select id into v_id from public.profiles where lower(email) = lower(btrim(p_email));
  if v_id is null then
    raise exception 'No account exists for that email. Invite the user in Supabase Auth first.' using errcode = 'P0001';
  end if;
  insert into public.admins (user_id, role, created_by) values (v_id, p_role, auth.uid())
  on conflict (user_id) do update set role = excluded.role;
end $$;

create or replace function public.admin_revoke(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner() then
    raise exception 'Only an owner can manage admin access.' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot remove your own access.' using errcode = 'P0001';
  end if;
  delete from public.admins where user_id = p_user_id;
  if not exists (select 1 from public.admins where role = 'owner') then
    raise exception 'At least one owner must remain.' using errcode = 'P0001';
  end if;
end $$;
