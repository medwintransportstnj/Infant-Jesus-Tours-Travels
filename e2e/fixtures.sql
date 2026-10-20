-- TEST FIXTURES ONLY — sample rows so the UI can be exercised end to end on a local stack.
-- Modelled on the kind of content the live site has; images come from e2e/fixture-images (generated).
-- Never run against the real project.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000aa', 'owner@test.local'), ('00000000-0000-0000-0000-0000000000bb', 'visitor@test.local'),
  ('00000000-0000-0000-0000-0000000000cc', 'office@test.local'), ('00000000-0000-0000-0000-0000000000dd', 'driver@test.local');
insert into public.admins (user_id, role) values ('00000000-0000-0000-0000-0000000000aa', 'owner'), ('00000000-0000-0000-0000-0000000000cc', 'admin'), ('00000000-0000-0000-0000-0000000000dd', 'driver');
update public.profiles set full_name = 'Arul', phone = '9876500011' where id = '00000000-0000-0000-0000-0000000000dd';
update public.profiles set full_name = 'Office Staff' where id = '00000000-0000-0000-0000-0000000000cc';
insert into public.vehicles (name, category_id, capacity, has_ac, price_label, sort_order, image_path)
select v.name, c.id, v.capacity, v.ac, v.price, v.ord, v.img from (values
  ('Test Sedan', 'Sedan', 4, true, '', 1, 'vehicles/dzire.webp'), ('Test SUV', 'SUV', 7, true, '', 2, 'vehicles/crysta.webp'),
  ('Test Traveller', 'Tempo Traveller', 14, true, '', 3, 'vehicles/tourister.webp'), ('Test Coach', 'Bus', 40, false, '', 4, 'vehicles/tavera.webp')
) as v(name, cat, capacity, ac, price, ord, img) join public.vehicle_categories c on c.name = v.cat;
insert into public.packages (title, package_type, duration, route, summary, image_path) values
  ('Test Pilgrimage Package', 'Pilgrimage', '2 days', 'Thanjavur → Velankanni', 'Fixture summary for layout testing.', 'packages/vailankanni.webp'),
  ('Test Basilica Day Trip', 'Pilgrimage', '1 day', 'Thanjavur → Poondi', 'Fixture summary for layout testing.', 'packages/poondi.webp');
insert into public.destinations (name, description, distance_label, image_path) values
  ('Test Destination A', 'Fixture description.', '90 km', 'destinations/sabarimala.webp'), ('Test Destination B', 'Fixture description.', '160 km', 'destinations/ooty.webp'),
  ('Test Destination C', 'Fixture description.', '320 km', 'destinations/varkala.webp'), ('Test Destination D', 'Fixture description.', '250 km', 'destinations/kodaikanal.webp');
insert into public.gallery_items (image_path, caption, section) values
  ('gallery/hero-ghat-road.webp', '', 'landing'), ('gallery/coonoor.webp', 'Fixture photo one', 'gallery'), ('gallery/flowers.webp', 'Fixture photo two', 'gallery');
insert into public.offers (title, description, expires_on) values ('Test Offer', 'Fixture offer for layout testing.', public.ist_today() + 6);
insert into public.testimonials (customer_name, rating, review) values ('Test Customer', 5, 'Fixture review for layout testing.');
