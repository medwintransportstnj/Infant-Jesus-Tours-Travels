-- Staff roles, drivers, notifications for every role and push dispatch. Runs after 01 and 02.
\set ON_ERROR_STOP 1
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'driver1@example.com', '{"full_name":"Kumar","phone":"9876500001"}'),
  ('00000000-0000-0000-0000-0000000000e2', 'driver2@example.com', '{"full_name":"Selvam"}'),
  ('00000000-0000-0000-0000-0000000000f1', 'meera@example.com',   '{"full_name":"Meera","phone":"9876500002"}');
insert into vault.decrypted_secrets values ('push_dispatch_url', 'https://example.supabase.co/functions/v1/push-dispatch'), ('push_dispatch_secret', 's3cret');

-- ===== owner grants roles =====
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select public.admin_grant('driver1@example.com', 'driver');
select public.admin_grant('driver2@example.com', 'driver');
select t.expect((select string_agg(role || ':' || coalesce(phone, ''), ',' order by email) from public.admin_list() where role = 'driver') = 'driver:9876500001,driver:', 'admin_list shows drivers with role and phone');
select public.admin_update_staff('00000000-0000-0000-0000-0000000000e2', 'Selvam R', '+91 98765 00003');
select t.expect((select phone from public.admin_list() where user_id = '00000000-0000-0000-0000-0000000000e2') = '+91 98765 00003', 'owner sets a driver''s name and phone');
select t.expect(public.my_staff_role() = 'owner', 'my_staff_role: owner');

-- ===== office staff =====
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select t.expect(public.my_staff_role() = 'admin', 'my_staff_role: office staff');
with u as (update public.site_settings set company_name = 'Changed by staff' returning 1) select t.expect((select count(*) from u) = 0, 'office staff cannot change website settings');
with u as (update public.social_links set value = '9000000000' where platform = 'whatsapp' returning 1) select t.expect((select count(*) from u) = 0, 'office staff cannot change the WhatsApp number');
with u as (update public.seo_settings set title = 'x' returning 1) select t.expect((select count(*) from u) = 0, 'office staff cannot change SEO');
with u as (update public.page_content set heading = 'x' returning 1) select t.expect((select count(*) from u) = 0, 'office staff cannot change page text');
with u as (update public.vehicles set sort_order = sort_order returning 1) select t.expect((select count(*) from u) > 0, 'office staff still manage vehicles');
select t.expect((select count(*) from public.bookings) > 0, 'office staff still read bookings');
select t.expect_error($$select public.admin_update_staff('00000000-0000-0000-0000-0000000000e1', 'x', '')$$, 'office staff editing staff details');
select t.expect_error($$select public.admin_grant('stranger@example.com', 'driver')$$, 'office staff adding a driver');

-- ===== driver has no office access =====
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select t.expect(public.my_staff_role() = 'driver' and not public.is_admin(), 'a driver is not office staff');
select t.expect((select count(*) from public.bookings) = 0, 'driver sees no bookings before assignment');
select t.expect((select count(*) from public.notifications) = 0, 'driver cannot read office notifications');
select t.expect((select count(*) from public.profiles) = 1, 'driver sees only their own profile');
select t.expect_error($$select public.admin_dashboard()$$, 'driver opening the office dashboard');
with u as (update public.vehicles set name = 'x' returning 1) select t.expect((select count(*) from u) = 0, 'driver cannot edit vehicles');

-- ===== a customer books =====
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
select public.create_booking(jsonb_build_object('request_type','Vehicle Booking','name','Meera','phone','9876500002',
  'pickup','Thanjavur','destination','Velankanni','travel_date',(public.ist_today()+3)::text,'travel_time','06:30','members','5',
  'idempotency_key','cccccccc-0000-0000-0000-000000000001'));
reset role;
select t.expect((select count(*) from net.calls) = 0, 'no push call when nobody has a device registered');
create temp table trip as select id, reference from public.bookings where customer_name = 'Meera';
grant select on trip to authenticated;

-- devices
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select public.push_subscribe('https://push.example/owner', repeat('k', 87), repeat('a', 22), 'Chrome');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select public.push_subscribe('https://push.example/staff', repeat('k', 87), repeat('a', 22), 'Chrome');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select public.push_subscribe('https://push.example/driver1', repeat('k', 87), repeat('a', 22), 'Android');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
select public.push_subscribe('https://push.example/meera', repeat('k', 87), repeat('a', 22), 'iPhone');
select public.push_subscribe('https://push.example/meera', repeat('z', 87), repeat('b', 22), 'iPhone');
select t.expect(public.push_is_subscribed('https://push.example/meera'), 'customer registers a device (re-registering updates it)');
select t.expect_error($$select * from public.push_subscriptions$$, 'reading push subscriptions directly');
set role anon; reset request.jwt.claim.sub;
select t.expect_error($$select public.push_subscribe('https://push.example/x', repeat('k', 87), repeat('a', 22), '')$$, 'anon registering a device');
reset role;
select t.expect((select count(*) from public.push_subscriptions) = 4, 'one row per person and device');

-- ===== office staff assigns a driver =====
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select t.expect_error(format($$update public.bookings set driver_id = '00000000-0000-0000-0000-00000000000c' where id = '%s'$$, (select id from trip)), 'assigning someone who is not a driver');
update public.bookings set driver_id = '00000000-0000-0000-0000-0000000000e1' where id = (select id from trip);
reset role;
select t.expect((select title || ' | ' || body from public.driver_notifications where driver_id = '00000000-0000-0000-0000-0000000000e1')
  = format('New trip assigned · %s | Thanjavur to Velankanni, %s at 06:30 AM, 5 passengers.', (select reference from trip), to_char(public.ist_today()+3, 'DD Mon')),
  'driver is told about the new trip with route, date, time and passengers');
select t.expect((select body from public.customer_notifications where kind = 'driver') = format('Kumar will drive your trip %s.', (select reference from trip)), 'customer is told who will drive');
select t.expect((select body from public.notifications where kind = 'assignment') = format('Kumar assigned to %s.', (select reference from trip)), 'office is told about the assignment');
select t.expect((select actor_id from public.notifications where kind = 'assignment') = '00000000-0000-0000-0000-00000000000b', 'notification records who made the change');
select t.expect((select (body ->> 'recipients')::jsonb from net.calls where body ->> 'title' like 'Driver assigned%' and body ->> 'url' like '/admin%') = '["00000000-0000-0000-0000-00000000000a"]'::jsonb,
  'push for an office event goes to the other staff, not the person who made the change');
select t.expect((select (body ->> 'recipients')::jsonb from net.calls where body ->> 'url' = '/account') = '["00000000-0000-0000-0000-0000000000f1"]'::jsonb, 'customer push goes only to that customer and opens their account');
select t.expect((select body ->> 'url' from net.calls where body ->> 'title' like 'New trip assigned%') = '/admin/trips', 'driver push opens My trips');
select t.expect((select headers ->> 'x-push-secret' from net.calls limit 1) = 's3cret', 'push call carries the shared secret');

-- ===== what the driver can see =====
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select t.expect((select count(*) from public.bookings) = 1, 'driver sees exactly their assigned trip');
select t.expect((select count(*) from public.driver_notifications) = 1, 'driver sees their own notification');
with u as (update public.bookings set status = 'Trip Completed' returning 1) select t.expect((select count(*) from u) = 0, 'driver cannot update bookings directly');
select t.expect_error(format($$select public.driver_complete_trip('%s')$$, (select id from trip)), 'completing a trip that is not confirmed yet');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e2';
select t.expect((select count(*) from public.bookings) = 0, 'another driver cannot see the trip');
select t.expect((select count(*) from public.driver_notifications) = 0, 'another driver cannot see the notification');
select t.expect_error(format($$select public.driver_complete_trip('%s')$$, (select id from trip)), 'another driver completing the trip');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
select t.expect((select count(*) from public.driver_notifications) = 0, 'customer sees no driver notifications');

-- ===== confirm, then the driver completes =====
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update public.bookings set status = 'Confirmed' where id = (select id from trip);
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select t.expect(public.driver_complete_trip((select id from trip)) = 'Trip Completed', 'driver marks the confirmed trip completed');
select t.expect(public.driver_complete_trip((select id from trip)) = 'Trip Completed', 'completing twice is harmless');
reset role;
select t.expect((select count(*) from public.driver_notifications where driver_id = '00000000-0000-0000-0000-0000000000e1' and kind = 'status') = 1,
  'driver is told when the office confirms, but not about their own completion');
select t.expect((select count(*) from public.notifications where kind = 'status' and title like '%' || (select reference from trip) and actor_id = '00000000-0000-0000-0000-0000000000e1') = 1, 'office is told the driver completed the trip');
select t.expect((select count(*) from public.customer_notifications c join trip on trip.id = c.booking_id where c.body like '%marked as completed%') = 1, 'customer is told the trip is completed');

-- ===== reassignment and trip changes =====
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update public.bookings set driver_id = '00000000-0000-0000-0000-0000000000e2' where id = (select id from trip);
update public.bookings set travel_time = '07:15' where id = (select id from trip);
reset role;
select t.expect((select count(*) from public.driver_notifications where driver_id = '00000000-0000-0000-0000-0000000000e1' and kind = 'unassigned') = 1, 'previous driver is told the trip was removed');
select t.expect((select count(*) from public.driver_notifications where driver_id = '00000000-0000-0000-0000-0000000000e2' and kind = 'assigned') = 1, 'new driver is told about the trip');
select t.expect((select body from public.driver_notifications where driver_id = '00000000-0000-0000-0000-0000000000e2' and kind = 'updated') like '%07:15 AM%', 'driver is told when trip details change');

-- ===== revoking the driver role removes access immediately =====
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select public.admin_revoke('00000000-0000-0000-0000-0000000000e2');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e2';
select t.expect((select count(*) from public.bookings) = 0, 'a former driver can no longer see trips');

-- ===== signing out removes the device =====
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
select public.push_unsubscribe('https://push.example/meera');
select t.expect(not public.push_is_subscribed('https://push.example/meera'), 'customer removes their device');
reset role;

-- ===== deleting a booking tells its driver =====
update public.bookings set driver_id = '00000000-0000-0000-0000-0000000000e1' where id = (select id from trip);
delete from public.bookings where id = (select id from trip);
select t.expect((select count(*) from public.driver_notifications where driver_id = '00000000-0000-0000-0000-0000000000e1' and title like 'Trip cancelled%') = 1, 'driver is told when their trip is deleted');

-- ===== without Vault secrets, notifications still work and push is skipped =====
delete from vault.decrypted_secrets;
delete from net.calls;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
update public.bookings set status = 'Office Calling' where reference = (select min(reference) from public.bookings);
reset role;
select t.expect((select count(*) from net.calls) = 0, 'no secrets configured: push is skipped silently');
select t.expect((select count(*) from public.notifications where kind = 'status' and actor_id = '00000000-0000-0000-0000-00000000000b') >= 1, 'no secrets configured: the notification is still saved');

select t.expect((select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('driver_notifications', 'customer_notifications', 'notifications', 'bookings')) = 4, 'all notification tables are published for live updates');
\echo ALL STAFF ROLE TESTS PASSED
