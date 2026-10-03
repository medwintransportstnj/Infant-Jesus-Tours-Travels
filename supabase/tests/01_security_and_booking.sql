-- Behavioural tests. Every assertion raises on failure, so psql -v ON_ERROR_STOP=1 exits non-zero.
\set ON_ERROR_STOP 1
create schema t;
create or replace function t.expect_error(q text, label text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then raise notice 'PASS (rejected) %: %', label, sqlerrm; return; end;
  raise exception 'FAIL: % was allowed', label;
end $$;
create or replace function t.expect(cond boolean, label text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAIL: %', label; end if; raise notice 'PASS %', label; end $$;
grant usage on schema t to anon, authenticated; grant execute on all functions in schema t to anon, authenticated;

-- fixtures (as superuser)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'staff@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'stranger@example.com');
insert into public.admins (user_id, role) values ('00000000-0000-0000-0000-00000000000a', 'owner');
insert into public.vehicles (id, name, capacity, is_active) values
  ('10000000-0000-0000-0000-000000000001', 'Test Sedan', 4, true),
  ('10000000-0000-0000-0000-000000000002', 'Retired Van', 12, false);
insert into public.offers (id, title, expires_on, is_enabled) values
  ('20000000-0000-0000-0000-000000000001', 'Live offer', public.ist_today() + 5, true),
  ('20000000-0000-0000-0000-000000000002', 'Expired offer', public.ist_today() - 1, true),
  ('20000000-0000-0000-0000-000000000003', 'Disabled offer', public.ist_today() + 5, false);
insert into public.gallery_items (image_path, is_hidden) values ('a.webp', false), ('b.webp', true);

select t.expect((select count(*) from public.profiles) = 3, 'auth users are mirrored into profiles');

-- ============ ANONYMOUS VISITOR ============
set role anon;
select t.expect((select count(*) from public.site_settings) = 1, 'anon reads site settings');
select t.expect((select count(*) from public.vehicles) = 1, 'anon sees only active vehicles');
select t.expect((select count(*) from public.offers) = 1, 'anon sees only live offers');
select t.expect((select count(*) from public.gallery_items) = 1, 'anon sees only visible gallery items');
select t.expect_error('select * from public.bookings', 'anon read bookings');
select t.expect_error('select * from public.contact_messages', 'anon read messages');
select t.expect_error('select * from public.notifications', 'anon read notifications');
select t.expect_error('select * from public.admins', 'anon read admins');
select t.expect_error('select * from public.profiles', 'anon read profiles');
select t.expect_error($$insert into public.bookings (reference, customer_name, phone) values ('IJT-9999','Mallory','9999999999')$$, 'anon direct booking insert');
select t.expect_error($$update public.site_settings set company_name = 'Hacked'$$, 'anon update settings');
select t.expect_error($$insert into public.vehicles (name, capacity) values ('x', 4)$$, 'anon insert vehicle');
select t.expect_error($$select nextval('public.booking_reference_seq')$$, 'anon touch reference sequence');
select t.expect_error($$select public.admin_dashboard()$$, 'anon dashboard');
select t.expect_error($$select public.admin_grant('stranger@example.com')$$, 'anon grant admin');
select t.expect_error($$insert into storage.objects (bucket_id, name) values ('gallery-images', 'evil.webp')$$, 'anon upload');

-- booking through the RPC
select t.expect(
  (public.create_booking(jsonb_build_object(
    'request_type','Vehicle Booking','name','  John  Doe ','phone','+91 98765 43210','pickup','Thanjavur','destination','Chennai',
    'travel_date', (public.ist_today() + 3)::text, 'travel_time','09:30','members','4',
    'vehicle_id','10000000-0000-0000-0000-000000000001','idempotency_key','aaaaaaaa-0000-0000-0000-000000000001',
    'reference','IJT-0666','status','Confirmed')) ->> 'reference') = 'IJT-0001',
  'first booking gets IJT-0001 and ignores a client-supplied reference');
select t.expect(
  (public.create_booking(jsonb_build_object(
    'request_type','Vehicle Booking','name','John Doe','phone','+91 98765 43210','pickup','Thanjavur','destination','Chennai',
    'travel_date', (public.ist_today() + 3)::text, 'travel_time','09:30','members','4',
    'idempotency_key','aaaaaaaa-0000-0000-0000-000000000001')) ->> 'reference') = 'IJT-0001',
  'retry with the same idempotency key returns the same booking');
select t.expect(
  (public.create_booking('{"request_type":"Instant Ride","name":"Asha","phone":"9876501234"}'::jsonb) ->> 'reference') = 'IJT-0002',
  'instant ride gets the next sequential reference');
select t.expect(
  (public.create_booking('{"request_type":"Offer Enquiry","name":"Ravi","phone":"9876501235","offer_id":"20000000-0000-0000-0000-000000000001"}'::jsonb) ->> 'subject_title') = 'Live offer',
  'offer title is looked up server-side');

select t.expect_error($$select public.create_booking('{"request_type":"Offer Enquiry","name":"Ravi","phone":"9876501235","offer_id":"20000000-0000-0000-0000-000000000002"}')$$, 'enquiry on expired offer');
select t.expect_error($$select public.create_booking('{"name":"A","phone":"9876501236"}')$$, 'one-letter name');
select t.expect_error($$select public.create_booking('{"name":"Bob","phone":"12345"}')$$, 'short phone');
select t.expect_error($$select public.create_booking('{"name":"Bob","phone":"9876501236","pickup":"A1","destination":"B1","travel_date":"2020-01-01","travel_time":"10:00","members":"2"}')$$, 'past travel date');
select t.expect_error($$select public.create_booking('{"name":"Bob","phone":"9876501236","pickup":"A1","destination":"B1","travel_date":"not-a-date","travel_time":"10:00","members":"2"}')$$, 'malformed date');
select t.expect_error(format($$select public.create_booking('{"name":"Bob","phone":"9876501236","pickup":"A1","destination":"B1","travel_date":"%s","travel_time":"10:00","members":"0"}')$$, public.ist_today() + 2), 'zero members');
select t.expect_error(format($$select public.create_booking('{"name":"Bob","phone":"9876501236","pickup":"A1","destination":"B1","travel_date":"%s","travel_time":"10:00","members":"2","round_trip":"true"}')$$, public.ist_today() + 2), 'round trip without return');
select t.expect_error(format($$select public.create_booking('{"name":"Bob","phone":"9876501236","pickup":"A1","destination":"B1","travel_date":"%s","travel_time":"10:00","members":"2","round_trip":"true","return_date":"%s","return_time":"09:00"}')$$, public.ist_today() + 2, public.ist_today() + 2), 'return before pickup');
select t.expect_error(format($$select public.create_booking('{"name":"Bob","phone":"9876501236","pickup":"A1","destination":"B1","travel_date":"%s","travel_time":"10:00","members":"2","vehicle_id":"10000000-0000-0000-0000-000000000002"}')$$, public.ist_today() + 2), 'inactive vehicle');
select t.expect_error($$select public.create_booking('{"name":"Bob","phone":"9876501236","request_type":"Admin"}')$$, 'unknown request type');

-- throttle: 5 allowed per number per 10 minutes, the 6th is refused
select public.create_booking('{"request_type":"Instant Ride","name":"Flood","phone":"9000000001"}') from generate_series(1, 5);
select t.expect_error($$select public.create_booking('{"request_type":"Instant Ride","name":"Flood","phone":"9000000001"}')$$, '6th request from one number in 10 minutes');

select public.create_contact_message('Meena', 'meena@example.com', 'Do you have a 12 seater?');
select t.expect_error($$select public.create_contact_message('Meena', 'not-an-email', 'hi there')$$, 'contact with bad email');
reset role;

select t.expect((select customer_name from public.bookings where reference = 'IJT-0001') = 'John Doe', 'name is trimmed and collapsed');
select t.expect((select status::text from public.bookings where reference = 'IJT-0001') = 'Pending', 'client cannot set status');
select t.expect((select vehicle_name from public.bookings where reference = 'IJT-0001') = 'Test Sedan', 'vehicle name snapshot taken server-side');
select t.expect((select count(*) from public.notifications where kind = 'booking') = (select count(*) from public.bookings), 'every booking produced a notification');
select t.expect((select count(*) from public.notifications where kind = 'message') = 1, 'contact message produced a notification');
select t.expect((select max(reference) from public.bookings) = 'IJT-0008', 'references are gap-free across failed validations');

-- ============ SIGNED-IN NON-ADMIN ============
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select t.expect((select count(*) from public.bookings) = 0, 'non-admin sees zero bookings');
select t.expect((select count(*) from public.contact_messages) = 0, 'non-admin sees zero messages');
select t.expect((select count(*) from public.profiles) = 1, 'non-admin sees only own profile');
select t.expect_error($$insert into public.vehicles (name, capacity) values ('x', 4)$$, 'non-admin insert vehicle');
select t.expect_error($$insert into public.admins (user_id) values ('00000000-0000-0000-0000-00000000000c')$$, 'non-admin self-promote via insert');
select t.expect_error($$select public.admin_grant('stranger@example.com', 'owner')$$, 'non-admin self-promote via RPC');
select t.expect_error($$select public.admin_dashboard()$$, 'non-admin dashboard');
select t.expect_error($$insert into storage.objects (bucket_id, name) values ('gallery-images', 'x.webp')$$, 'non-admin upload');
with u as (update public.bookings set status = 'Confirmed' returning 1)
select t.expect((select count(*) from u) = 0, 'non-admin update of bookings touches nothing');
with u as (update public.site_settings set company_name = 'Hacked' returning 1)
select t.expect((select count(*) from u) = 0, 'non-admin update of settings touches nothing');

-- ============ OWNER ============
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select t.expect((select count(*) from public.bookings) = 8, 'admin reads all bookings');
select t.expect((select count(*) from public.vehicles) = 2, 'admin sees inactive vehicles');
select t.expect((select count(*) from public.offers) = 3, 'admin sees expired/disabled offers');
update public.bookings set status = 'Confirmed', reference = 'IJT-TAMPER' where reference = 'IJT-0001';
select t.expect((select status::text from public.bookings where reference = 'IJT-0001') = 'Confirmed', 'admin changes status; reference is immutable');
select t.expect((public.admin_dashboard() ->> 'total_bookings')::int = 8, 'dashboard totals are real');
select t.expect((public.admin_dashboard() ->> 'confirmed')::int = 1, 'dashboard confirmed count');
select t.expect(jsonb_array_length(public.admin_dashboard() -> 'daily') = 7, 'dashboard returns a 7 day series');
insert into storage.objects (bucket_id, name) values ('gallery-images', 'gallery/abc-123.webp');
select t.expect_error($$insert into storage.objects (bucket_id, name) values ('gallery-images', '../evil.php')$$, 'admin upload with unsafe filename');
select t.expect_error($$insert into storage.objects (bucket_id, name) values ('gallery-images', 'x.svg')$$, 'admin upload svg');
select t.expect_error($$update public.site_settings set map_embed_url = 'javascript:alert(1)'$$, 'non-Google map embed');
select t.expect_error($$update public.social_links set value = 'javascript:alert(1)' where platform = 'facebook'$$, 'javascript: social link');
select public.admin_grant('staff@example.com');
select t.expect((select count(*) from public.admin_list()) = 2, 'owner can grant admin');
select t.expect_error($$select public.admin_revoke('00000000-0000-0000-0000-00000000000a')$$, 'owner removing self');

-- ============ PLAIN ADMIN ============
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select t.expect_error($$select public.admin_grant('stranger@example.com')$$, 'plain admin granting access');
select t.expect_error($$select public.admin_revoke('00000000-0000-0000-0000-00000000000a')$$, 'plain admin revoking owner');
delete from public.bookings where reference = 'IJT-0002';
select t.expect((select count(*) from public.bookings) = 7, 'admin can delete a booking');
reset role;
select t.expect((select count(*) from public.notifications where kind = 'booking') = 7, 'deleting a booking cascades its notification');
\echo ALL DATABASE TESTS PASSED
