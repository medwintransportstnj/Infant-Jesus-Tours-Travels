-- TEST FIXTURES ONLY — sample rows so the UI can be exercised end to end on a local stack.
-- Never run against the real project: none of this is real business content.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000aa', 'owner@test.local'), ('00000000-0000-0000-0000-0000000000bb', 'visitor@test.local');
insert into public.admins (user_id, role) values ('00000000-0000-0000-0000-0000000000aa', 'owner');
insert into public.vehicles (name, category_id, capacity, has_ac, price_label, sort_order)
select v.name, c.id, v.capacity, v.ac, v.price, v.ord from (values
  ('Test Sedan', 'Sedan', 4, true, '', 1), ('Test SUV', 'SUV', 7, true, '', 2), ('Test Traveller', 'Tempo Traveller', 14, true, '', 3), ('Test Coach', 'Bus', 40, false, '', 4)
) as v(name, cat, capacity, ac, price, ord) join public.vehicle_categories c on c.name = v.cat;
insert into public.packages (title, package_type, duration, route, summary) values ('Test Pilgrimage Package', 'Pilgrimage', '2 days', 'Thanjavur → Velankanni', 'Fixture summary for layout testing.');
insert into public.destinations (name, description, distance_label) values ('Test Destination A', 'Fixture description.', '90 km'), ('Test Destination B', 'Fixture description.', '160 km');
insert into public.offers (title, description, expires_on) values ('Test Offer', 'Fixture offer for layout testing.', public.ist_today() + 6);
insert into public.testimonials (customer_name, rating, review) values ('Test Customer', 5, 'Fixture review for layout testing.');
