-- =====================================================================
-- Seed: the content that was embedded in the legacy index.html / admin.js.
-- Idempotent — safe to run more than once. Nothing here is invented:
-- vehicles, packages, destinations, offers, testimonials and gallery were
-- empty in the legacy project and are left for the admin to add.
-- =====================================================================
insert into public.site_settings (id, company_name, tagline, address, phone, email, map_embed_url, default_theme)
values (
  1,
  'Infant Jesus Tours & Travels',
  'Reliable Travel. Comfortable Journeys.',
  'Sriram Nagar, R.R. Nagar Road, Madhakottai, Thanjavur, Tamil Nadu',
  '+91 98424 87017',
  'bookings@infantjesustours.in',
  'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3588.077729841336!2d79.11746107457458!3d10.747230659732516!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3baab9ce1fe09f59%3A0xd1137ef6b13dc08f!2sInfant%20Jesus%20tours%20%26%20travels!5e1!3m2!1sen!2sin!4v1786248286605!5m2!1sen!2sin',
  'light'
) on conflict (id) do nothing;

insert into public.seo_settings (id, title, description, keywords)
values (
  1,
  'Infant Jesus Tours & Travels — Your Journey Begins With Us',
  'Infant Jesus Tours & Travels — safe, comfortable, affordable vehicle rentals and tour packages across India. Based in Thanjavur, Tamil Nadu.',
  'tours and travels Thanjavur, vehicle rental Thanjavur, tempo traveller, tour packages Tamil Nadu, pilgrimage tours'
) on conflict (id) do nothing;

insert into public.social_links (platform, value) values
  ('whatsapp', '9842487017'),
  ('facebook', ''), ('instagram', ''), ('youtube', ''), ('linkedin', '')
on conflict (platform) do nothing;

insert into public.page_content (slug, name, description, heading, body) values
  ('home', 'Home', 'Hero headline and introduction',
   'Reliable Travel. Comfortable Journeys.',
   'Professional tours, travels and vehicle booking services for local, outstation, pilgrimage and customized journeys.'),
  ('about', 'About Us', 'Company story',
   'Travel With Confidence',
   'Infant Jesus Tours & Travels arranges vehicle rentals and tour packages across Tamil Nadu and beyond. From devotional tours to family holidays, corporate trips and airport transfers, tell us your journey and our office will confirm the details with you directly.'),
  ('contact', 'Contact', 'Introduction above the contact form',
   'Plan a journey with us',
   'Call, WhatsApp or send a message and our office will get back to you.'),
  ('gallery', 'Gallery', 'Introduction above the photo grid',
   'Moments From Our Journeys',
   'Photographs from journeys with our travellers.')
on conflict (slug) do nothing;

-- Category names only (the legacy admin suggested "Sedan, SUV, Traveller" as examples).
insert into public.vehicle_categories (name, sort_order) values
  ('Sedan', 1), ('SUV', 2), ('MPV', 3), ('Tempo Traveller', 4), ('Bus', 5)
on conflict do nothing;
