-- Customer accounts, ownership and notifications. Runs after 01 (reuses t.expect helpers and fixtures).
\set ON_ERROR_STOP 1
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d1', 'Asha@Example.com', '{"full_name":"Asha  Devi","phone":"+91 98765 11111"}'),
  ('00000000-0000-0000-0000-0000000000d2', 'ravi@example.com', '{"full_name":"Ravi","phone":"not a phone <script>"}');
select t.expect((select email||'|'||full_name||'|'||phone from public.profiles where id='00000000-0000-0000-0000-0000000000d1') = 'asha@example.com|Asha Devi|+91 98765 11111', 'sign-up metadata becomes a clean profile');
select t.expect((select phone from public.profiles where id='00000000-0000-0000-0000-0000000000d2') = '', 'invalid phone in metadata is dropped');

-- ===== customer 1 =====
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select public.create_booking(jsonb_build_object('request_type','Vehicle Booking','name','Asha Devi','phone','+91 98765 11111','email','asha@example.com',
  'pickup','Thanjavur','destination','Madurai','travel_date',(public.ist_today()+4)::text,'travel_time','08:00','members','3',
  'customer_id','00000000-0000-0000-0000-0000000000d2','idempotency_key','bbbbbbbb-0000-0000-0000-000000000001'));
select public.create_booking(jsonb_build_object('request_type','Vehicle Booking','name','Asha Devi','phone','+91 98765 11111',
  'pickup','Thanjavur','destination','Madurai','travel_date',(public.ist_today()+4)::text,'travel_time','08:00','members','3',
  'idempotency_key','bbbbbbbb-0000-0000-0000-000000000001'));
select t.expect((select count(*) from public.bookings) = 1, 'customer sees exactly their own booking (retry did not duplicate)');
select t.expect((select customer_id from public.bookings) = '00000000-0000-0000-0000-0000000000d1', 'ownership comes from auth.uid(), not the payload');
select t.expect((select title||'|'||body from public.customer_notifications) = 'Booking Request Received|We received your vehicle booking IJT-0009. It is pending review.', 'customer notified of the new booking');
with u as (update public.bookings set status = 'Confirmed' returning 1) select t.expect((select count(*) from u) = 0, 'customer cannot change booking status');
with d as (delete from public.bookings returning 1) select t.expect((select count(*) from d) = 0, 'customer cannot delete bookings');
select t.expect_error($$update public.customer_notifications set body = 'tampered'$$, 'customer editing notification text');
select t.expect_error($$insert into public.customer_notifications (customer_id, kind, title) values ('00000000-0000-0000-0000-0000000000d1','booking','fake')$$, 'customer forging a notification');
select t.expect((select count(*) from public.notifications) = 0, 'customer cannot see admin notifications');
update public.profiles set phone = '98765 22222' where id = (select auth.uid());
select t.expect((select phone from public.profiles) = '98765 22222', 'customer updates own phone');
select t.expect_error($$update public.profiles set email = 'owner@example.com'$$, 'customer changing profile email directly');
with u as (update public.profiles set full_name = 'Hacked' where id = '00000000-0000-0000-0000-0000000000d2' returning 1) select t.expect((select count(*) from u) = 0, 'customer cannot edit another profile');

-- ===== customer 2 =====
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d2';
select t.expect((select count(*) from public.bookings) = 0, 'second customer sees none of the first customer''s bookings');
select t.expect((select count(*) from public.customer_notifications) = 0, 'second customer sees none of the first customer''s notifications');
select t.expect((select count(*) from public.profiles) = 1, 'second customer sees only their own profile');
with u as (update public.customer_notifications set is_read = true returning 1) select t.expect((select count(*) from u) = 0, 'second customer cannot mark another''s notification read');

-- ===== anonymous =====
set role anon; reset request.jwt.claim.sub;
select t.expect_error('select * from public.customer_notifications', 'anon read customer notifications');
select public.create_booking('{"request_type":"Instant Ride","name":"Guest Rider","phone":"9876577777"}'::jsonb);
reset role;
select t.expect((select customer_id is null from public.bookings where customer_name = 'Guest Rider'), 'guest quick request has no owner');

-- ===== admin changes status =====
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update public.bookings set status = 'Office Calling' where reference = 'IJT-0009';
update public.bookings set status = 'Confirmed', customer_id = '00000000-0000-0000-0000-0000000000d2' where reference = 'IJT-0009';
update public.bookings set notes = 'no status change' where reference = 'IJT-0009';
select t.expect((select customer_id from public.bookings where reference = 'IJT-0009') = '00000000-0000-0000-0000-0000000000d1', 'even an admin cannot reassign a booking to another customer');
select t.expect((select count(*) from public.notifications where kind = 'status' and title = 'Booking Status Updated · IJT-0009') = 2, 'each status change creates one admin notification (and edits without a status change create none)');
select t.expect((select count(*) from public.customer_notifications) = 0, 'admins have no access to customer notifications');

-- ===== customer 1 sees the updates =====
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select t.expect((select string_agg(body, ' / ' order by created_at) from public.customer_notifications where kind = 'status')
  = 'Our office is calling regarding booking IJT-0009. / Your booking IJT-0009 has been confirmed.', 'customer receives one notification per status change, in the stated wording');
select t.expect((select status::text from public.bookings) = 'Confirmed', 'customer sees the new status on their booking');
update public.customer_notifications set is_read = true;
select t.expect((select count(*) from public.customer_notifications where not is_read) = 0, 'customer marks own notifications read');
reset role;

-- account deletion keeps the booking for the office but detaches it
delete from auth.users where id = '00000000-0000-0000-0000-0000000000d1';
select t.expect((select customer_id is null from public.bookings where reference = 'IJT-0009'), 'deleting an account detaches (does not delete) its bookings');
select t.expect((select count(*) from public.customer_notifications where customer_id = '00000000-0000-0000-0000-0000000000d1') = 0, 'deleting an account removes its notifications');
\echo ALL CUSTOMER TESTS PASSED
