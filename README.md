# Infant Jesus Tours & Travels

Customer website and admin dashboard. React + Vite + TypeScript + Tailwind on the front, Supabase (Postgres, Auth, Storage, Realtime) behind it, deployed on Vercel.

`legacy/` holds the original static site for reference only; nothing in the build uses it.

## How it fits together

- **Visitors** read published content straight from Supabase and create requests only through two database functions: `create_booking()` and `create_contact_message()`. Those functions validate everything again server-side and issue the `IJT-0001` reference from a sequence.
- **Customers** register or log in at `/register` and `/login` (or simply while booking). A vehicle booking is always attached to the signed-in customer; `/account` shows their own bookings and notifications, live. Customer and admin sessions are stored separately and never mix.
- **Admins** sign in with Supabase Auth (email + password). Access is decided by a row in `public.admins`, checked by Row Level Security on every request — hiding the UI is a convenience, RLS is the lock.
- **Images** live in Supabase Storage; tables store only the object path.
- **Realtime** pushes new bookings, messages and content changes to open tabs. There is no polling.
- The browser stores only the visitor's light/dark choice, the admin auth session (Supabase's own), and — for the current tab only — the visitor's last booking receipt.

## 1. Supabase setup (once)

1. Create a project at supabase.com. Region: Mumbai (`ap-south-1`) is closest.
2. Run the SQL files **in this order** in *SQL Editor* (or `supabase db push` with the CLI):
   1. `supabase/migrations/20261003000100_schema.sql`
   2. `supabase/migrations/20261003000200_rls.sql`
   3. `supabase/migrations/20261003000300_storage.sql`
   4. `supabase/migrations/20261003000400_realtime.sql`
   5. `supabase/migrations/20261003000500_customer_accounts_notifications.sql`
   6. `supabase/seed.sql` (company details, WhatsApp number, map, SEO text, page text, vehicle categories)
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
   - *Database → Publications → supabase_realtime*: confirm `bookings`, `notifications` and `customer_notifications` are listed (the migrations add them).
   - For real traffic, configure custom SMTP under *Authentication → Emails*; the built-in sender is rate-limited to a few emails per hour.
7. *Project Settings → API*: copy the **Project URL** and the **anon public** key.

Never put the `service_role` key in this project. It is not needed anywhere.

Further admins: create the user in *Authentication → Users*, then add their email in **Admin → Admin Management** (owners only).

## 2. Environment variables

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | anon public key |
| `VITE_SITE_URL` | Public site address, no trailing slash (used for canonical/OG tags, robots.txt, sitemap.xml). On Vercel it falls back to the production domain if unset. |

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

Dashboard: *Add New → Project → import the GitHub repo*. Framework preset **Vite** (build `npm run build`, output `dist`) is detected from `vercel.json`. Add the three environment variables for Production and Preview, then Deploy.

CLI alternative:

```bash
npm i -g vercel
vercel link
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel env add VITE_SITE_URL production
vercel --prod
```

`vercel.json` also sets the SPA rewrite and security headers, including a Content-Security-Policy that allows only this site, `*.supabase.co` and Google Maps embeds. If you later use a custom Supabase domain, add it to `connect-src` and `img-src` there.

## 6. After the first deploy

- Sign in at `/admin`, check **Website Settings** and **WhatsApp & Social**, then add vehicles, packages, destinations and photos. Those sections were empty in the legacy site, so the public pages show honest empty states until you add content.
- Submit a test booking from a phone and confirm it appears in **Bookings** without refreshing.

## Database

Tables: `customer_notifications`, `profiles`, `admins`, `site_settings`, `seo_settings`, `social_links`, `page_content`, `vehicle_categories`, `vehicles`, `packages`, `destinations`, `offers`, `gallery_items`, `testimonials`, `bookings`, `contact_messages`, `notifications`.

Storage buckets (public read, admin-only write, JPG/PNG/WebP only): `vehicle-images`, `gallery-images`, `website-assets` (5 MB), `logos` (1 MB).

RLS in one paragraph: anyone can read published content (active vehicles, published packages/destinations/testimonials, visible gallery items, enabled and unexpired offers, settings). Nobody but an admin can read or change bookings, messages or notifications, and there is no insert policy on those tables at all — rows are created only by the two public functions. A signed-in customer can read only their own bookings, profile and notifications; ownership (`bookings.customer_id`) is set from `auth.uid()` by a trigger and cannot be supplied or changed by a client. `admins` has no policies; it is reachable only through the owner-only `admin_grant` / `admin_revoke` functions.

Abuse limits built into the functions: 5 requests per phone number and 3 messages per email per 10 minutes. For stronger bot protection add Cloudflare Turnstile or Supabase CAPTCHA later.

## Tests

- `npm test` — unit tests for WhatsApp links, vehicle recommendation, validation, formatting.
- `supabase/tests/run-local.sh` — applies the migrations to a throwaway local Postgres and runs 93 RLS/booking/customer assertions (needs `psql` as a superuser). `00_supabase_stubs.sql` stands in for Supabase's `auth`/`storage` schemas; never run it against a real project.
- `e2e/` — browser tests (Playwright, Python) against a local stack: real Postgres + PostgREST with the real migrations, and a small stand-in for Auth and Storage. See `e2e/start.sh` and `e2e/local-stack.mjs`. Realtime is not emulated there.

## WhatsApp behaviour

Every successful request (vehicle booking, instant ride, offer or package enquiry) opens WhatsApp on the number set in **Admin → WhatsApp & Social**, with the details prefilled. The customer still presses Send — a website cannot send a WhatsApp message by itself. If the browser blocks the new tab, the booking still succeeds and an **Open WhatsApp** button is shown; if no valid number is configured, the booking still succeeds and the page says so.

The developer contact box in the footer uses its own fixed number and is unrelated to the business number.

## Logo

`public/ijt-logo.png` is the default brand mark and the browser/phone icon. A logo uploaded in **Admin → Website Settings** overrides it on the site (the browser tab icon stays the bundled file).
