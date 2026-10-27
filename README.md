# Infant Jesus Tours & Travels

Customer website and admin dashboard. React + Vite + TypeScript + Tailwind on the front, Supabase (Postgres, Auth, Storage, Realtime) behind it, deployed on Vercel.

`legacy/` holds the original static site for reference only; nothing in the build uses it.

## How it fits together

- **Visitors** read published content straight from Supabase and create requests only through two database functions: `create_booking()` and `create_contact_message()`. Those functions validate everything again server-side and issue the `IJT-0001` reference from a sequence.
- **Customers** register or log in at `/register` and `/login` (or simply while booking). A vehicle booking is always attached to the signed-in customer; `/account` shows their own bookings and notifications, live. Customer and admin sessions are stored separately and never mix.
- **Staff** sign in at `/admin` with Supabase Auth (email + password). Their role is a row in `public.admins`, checked by Row Level Security on every request — hiding the UI is a convenience, RLS is the lock. See *Roles* below.
- **Drivers** sign in at the same `/admin` address and get a phone-first screen with only the trips assigned to them.
- **Images** live in Supabase Storage; tables store only the object path.
- **Live notifications** reach every role the moment something happens (see *Live notifications* below): a popup and a chime in any open tab, and — once a person switches on device notifications — a phone/desktop notification even when the site is closed.
- The browser stores only the visitor's light/dark choice, the admin auth session (Supabase's own), and — for the current tab only — the visitor's last booking receipt.

## 1. Supabase setup (once)

1. Create a project at supabase.com. Region: Mumbai (`ap-south-1`) is closest.
2. Run the SQL files **in this order** in *SQL Editor* (or `supabase db push` with the CLI):
   1. `supabase/migrations/20261003000100_schema.sql`
   2. `supabase/migrations/20261003000200_rls.sql`
   3. `supabase/migrations/20261003000300_storage.sql`
   4. `supabase/migrations/20261003000400_realtime.sql`
   5. `supabase/migrations/20261003000500_customer_accounts_notifications.sql`
   6. `supabase/migrations/20261019000100_driver_role.sql` — **run this one on its own**, then:
   7. `supabase/migrations/20261019000200_staff_roles_drivers_push.sql` (staff roles, drivers, trip notifications, device-notification plumbing)
   8. `supabase/seed.sql` (company details, WhatsApp number, map, SEO text, page text, vehicle categories) — new projects only

   Step 6 adds the `driver` value to a Postgres enum; Postgres won't let the same transaction use a new enum value, which is why 6 and 7 are separate runs. `supabase db push` handles this by itself.
3. *Authentication → Providers → Email*: keep Email enabled and keep **"Allow new users to sign up" ON** — customers create their own accounts. Being signed up grants nothing in the dashboard: admin access still requires a row in `public.admins`.
   - **Confirm email**: with it OFF, a first-time customer can register and book in one go. With it ON, they must open the confirmation email before the booking can be submitted (the booking page tells them and keeps their details). Choose one; both are supported.
   - Set the minimum password length to 8 to match the site.
4. *Authentication → Users → Add user*: create the first admin (tick "Auto Confirm User", use a long password).
5. Make that user the owner — run once in SQL Editor:
   ```sql
   insert into public.admins (user_id, role)
   select id, 'owner' from auth.users where email = 'YOUR-EMAIL-HERE';
   ```
6. *Authentication → URL Configuration*: set **Site URL** to your Vercel domain and add these **Redirect URLs**: `https://YOUR-DOMAIN/account` and `https://YOUR-DOMAIN/reset-password` (plus the `http://localhost:5173/...` equivalents for local work).
   - *Database → Publications → supabase_realtime*: confirm `bookings`, `notifications`, `customer_notifications` and `driver_notifications` are listed (the migrations add them).
   - For real traffic, configure custom SMTP under *Authentication → Emails*; the built-in sender is rate-limited to a few emails per hour.
7. *Project Settings → API*: copy the **Project URL** and the **anon public** key.

Never put the `service_role` key in the website or in any `VITE_` variable. The only code that uses it is the `push-dispatch` Edge Function, where Supabase provides it automatically on the server.

Further staff and drivers: create the user in *Authentication → Users* (tick Auto Confirm), then add their email in **Admin → Staff & Drivers** and pick the role (owners only).

8. Device notifications (optional but recommended) — see *Live notifications → Notifications when the site is closed* below.

## 2. Environment variables

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | anon public key |
| `VITE_SITE_URL` | Public site address, no trailing slash (used for canonical/OG tags, robots.txt, sitemap.xml). On Vercel it falls back to the production domain if unset. |
| `VITE_VAPID_PUBLIC_KEY` | The **public** VAPID key for device notifications (safe to publish). Leave unset to hide the "Notify me on this device" switch. The private key never goes here. |

Locally: `cp .env.example .env.local` and fill it in. `.env*` files are git-ignored.

## 3. Local development

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
npm run lint
npm test           # unit tests
```

Admin is at `/admin`.

## 4. GitHub

```bash
git remote add origin https://github.com/YOUR-USER/infant-jesus-tours.git
git push -u origin main
```

## 5. Vercel

Dashboard: *Add New → Project → import the GitHub repo*. Framework preset **Vite** (build `npm run build`, output `dist`) is detected from `vercel.json`. Add the environment variables for Production and Preview, then Deploy.

**Deployment Protection:** under *Project → Settings → Deployment Protection*, make sure the **production** domain is public (Vercel Authentication applies to preview URLs only). If visitors are asked to log in to Vercel, nobody can book.

CLI alternative:

```bash
npm i -g vercel
vercel link
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel env add VITE_SITE_URL production
vercel env add VITE_VAPID_PUBLIC_KEY production
vercel --prod
```

`vercel.json` also sets the SPA rewrite and security headers, including a Content-Security-Policy that allows only this site, `*.supabase.co` and Google Maps embeds. If you later use a custom Supabase domain, add it to `connect-src` and `img-src` there.

## 6. After the first deploy

- Sign in at `/admin`, check **Website Settings** and **WhatsApp & Social**, then add vehicles, packages, destinations and photos. Those sections were empty in the legacy site, so the public pages show honest empty states until you add content.
- Open **Admin → Staff & Drivers**, add your office staff and drivers.
- Submit a test booking from a phone while the dashboard is open on a computer: it should pop up with a chime and appear in **Bookings** without refreshing. Assign a driver and confirm the driver's phone shows it.

## Database

Tables: `customer_notifications`, `driver_notifications`, `push_subscriptions`, `profiles`, `admins`, `site_settings`, `seo_settings`, `social_links`, `page_content`, `vehicle_categories`, `vehicles`, `packages`, `destinations`, `offers`, `gallery_items`, `testimonials`, `bookings`, `contact_messages`, `notifications`.

Storage buckets (public read, admin-only write, JPG/PNG/WebP only): `vehicle-images`, `gallery-images`, `website-assets` (5 MB), `logos` (1 MB).

RLS in one paragraph: anyone can read published content (active vehicles, published packages/destinations/testimonials, visible gallery items, enabled and unexpired offers, settings). Nobody but an admin can read or change bookings, messages or notifications, and there is no insert policy on those tables at all — rows are created only by the two public functions. A signed-in customer can read only their own bookings, profile and notifications; ownership (`bookings.customer_id`) is set from `auth.uid()` by a trigger and cannot be supplied or changed by a client. `admins` has no policies; it is reachable only through the owner-only `admin_grant` / `admin_revoke` functions.

Abuse limits built into the functions: 5 requests per phone number and 3 messages per email per 10 minutes. For stronger bot protection add Cloudflare Turnstile or Supabase CAPTCHA later.

## Tests

- `npm test` — unit tests for WhatsApp links, vehicle recommendation, validation, formatting.
- `npm test` also sends a real encrypted Web Push message to a local test server, to prove the Edge Function's sending code.
- `supabase/tests/run-local.sh` — applies the migrations to a throwaway local Postgres and runs 150 RLS/booking/customer/staff-role/push assertions (needs `psql` as a superuser). `00_supabase_stubs.sql` stands in for Supabase's `auth`/`storage`/`vault`/`net` schemas; never run it against a real project.
- `e2e/` — browser tests (Playwright, Python) against a local stack: real Postgres + PostgREST with the real migrations, a small stand-in for Auth and Storage, and a Realtime stand-in (`e2e/realtime.mjs`) that re-checks every change against RLS for each subscriber. `e2e/live_roles_flow.py` runs owner, office staff, driver and customer in four browsers at once and checks every live hand-off. See `e2e/start.sh` and `e2e/local-stack.mjs`.

## Roles

| Role | Signs in at | Can do |
|---|---|---|
| **Owner** | `/admin` | Everything: bookings, enquiries, messages, website content, website settings, WhatsApp number, SEO, theme, page text, staff and drivers. |
| **Office staff** | `/admin` | Bookings, enquiries, contact messages, notifications, assigning drivers, and website content (vehicles, packages, destinations, offers, gallery, testimonials). Cannot change website settings or staff. |
| **Driver** | `/admin` | Only the trips assigned to them: customer name and phone, pickup, destination, date and time, call / WhatsApp / directions buttons, and **Mark trip completed** (only for confirmed trips). Nothing else. |
| **Customer** | `/login` | Their own bookings and notifications. |

The database enforces all of this (`is_admin()`, `is_owner()`, `is_driver()` and the policies built on them); the screens only follow it. Assign a driver from the **Driver** column in **Bookings** — only people added as drivers can be picked.

## Live notifications

| Event | Office staff & owner | Driver | Customer |
|---|---|---|---|
| New booking / enquiry | ✓ | | (their own confirmation, no popup) |
| New contact message | ✓ | | |
| Driver assigned or removed | ✓ | ✓ the old and new driver | ✓ "Driver assigned" with the driver's name |
| Booking status changed | ✓ | ✓ their trip | ✓ their booking |
| Trip details changed | | ✓ their trip | |
| Driver marks trip completed | ✓ | | ✓ |

- **In an open tab:** a popup with a *View* link, a short chime (each person can switch sound off from the bell), the bell count, and lists that update without refreshing. Nobody gets a popup or chime for their own action.
- **Connection state:** staff screens and the customer's booking history show a small **Live** badge. If the connection drops (sleeping phone, bad network), the page catches up automatically when it returns.
- **Notifications when the site is closed:** each person can tap **Notify me on this device** under the bell. This uses standard Web Push (no extra app). On iPhone/iPad it works only after *Share → Add to Home Screen* (iOS 16.4+) — the switch says so.

### Setting up device notifications (once)

1. Generate VAPID keys on your computer: `npx web-push generate-vapid-keys`.
2. Deploy the Edge Function (Supabase CLI):
   ```bash
   supabase functions deploy push-dispatch --no-verify-jwt --project-ref YOUR-PROJECT-REF
   supabase secrets set --project-ref YOUR-PROJECT-REF \
     PUSH_DISPATCH_SECRET="a-long-random-string" \
     VAPID_PUBLIC_KEY="..." VAPID_PRIVATE_KEY="..." VAPID_SUBJECT="mailto:you@example.com"
   ```
   `--no-verify-jwt` is required because the database calls it with the shared secret instead of a user token; requests without the secret are refused.
3. *Database → Extensions*: enable **pg_net**.
4. In *SQL Editor*, store the address and the same secret in Vault (the database reads them to call the function):
   ```sql
   select vault.create_secret('https://YOUR-PROJECT-REF.supabase.co/functions/v1/push-dispatch', 'push_dispatch_url');
   select vault.create_secret('a-long-random-string', 'push_dispatch_secret');
   ```
5. In Vercel add `VITE_VAPID_PUBLIC_KEY` (the **public** key only) and redeploy.

Until these steps are done, everything else — popups, chime, live lists — still works in open tabs; the "Notify me on this device" switch explains that it is not set up yet.

## WhatsApp behaviour

Every successful request (vehicle booking, instant ride, offer or package enquiry) opens WhatsApp on the number set in **Admin → WhatsApp & Social**, with the details prefilled. The customer still presses Send — a website cannot send a WhatsApp message by itself. If the browser blocks the new tab, the booking still succeeds and an **Open WhatsApp** button is shown; if no valid number is configured, the booking still succeeds and the page says so.

The developer contact box in the footer uses its own fixed number and is unrelated to the business number.

## Logo

`public/ijt-logo.png` is the default brand mark and the browser/phone icon. A logo uploaded in **Admin → Website Settings** overrides it on the site (the browser tab icon stays the bundled file).
