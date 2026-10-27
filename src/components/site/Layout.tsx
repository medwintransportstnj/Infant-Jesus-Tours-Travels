import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { CalendarCheck, LogOut, Mail, MapPin, Menu, MessageCircle, Moon, Phone, Sun, UserRound, X } from 'lucide-react';
import { useSiteData } from '@/hooks/useSiteData';
import { useContact } from '@/hooks/useContact';
import { useTheme } from '@/hooks/useTheme';
import { useCustomer } from '@/customer/auth';
import { NotificationBell } from '@/customer/NotificationBell';
import { FacebookIcon, InstagramIcon, LinkedinIcon, YoutubeIcon } from './BrandIcons';
import { DeveloperCard } from './DeveloperCard';
import { LogoMark, Wordmark } from './Logo';

const NAV = [
  { to: '/', label: 'Home' }, { to: '/vehicles', label: 'Vehicles' }, { to: '/packages', label: 'Packages' },
  { to: '/destinations', label: 'Destinations' }, { to: '/offers', label: 'Offers' }, { to: '/gallery', label: 'Gallery' },
  { to: '/about', label: 'About' }, { to: '/contact', label: 'Contact' },
];

function ThemeToggle({ className = '' }: { className?: string }) {
  const { mode, toggle } = useTheme();
  return (
    <button type="button" onClick={toggle} aria-label={mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink hover:bg-sunken ${className}`}>
      {mode === 'dark' ? <Sun className="h-[18px] w-[18px]" aria-hidden /> : <Moon className="h-[18px] w-[18px]" aria-hidden />}
    </button>
  );
}

/** Thin bar above the header on large screens: the office's phone, WhatsApp and email, always one click away. */
function TopBar() {
  const contact = useContact();
  const wa = contact.whatsappUrl();
  if (!contact.telHref && !wa && !contact.email) return null;
  const item = 'inline-flex items-center gap-1.5 text-white/80 hover:text-white';
  return (
    <div className="hidden bg-inverse text-[13px] lg:block">
      <div className="container-page flex h-9 items-center justify-between gap-6">
        <p className="truncate text-white/60">{contact.address}</p>
        <div className="flex shrink-0 items-center gap-5">
          {contact.telHref && <a href={contact.telHref} className={item}><Phone className="h-3.5 w-3.5" aria-hidden />{contact.phone}</a>}
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className={item}><MessageCircle className="h-3.5 w-3.5" aria-hidden />WhatsApp</a>}
          {contact.email && <a href={`mailto:${contact.email}`} className={item}><Mail className="h-3.5 w-3.5" aria-hidden />{contact.email}</a>}
        </div>
      </div>
    </div>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const customer = useCustomer();
  const signedIn = customer.status === 'signedIn';
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-canvas/95 backdrop-blur supports-[backdrop-filter]:bg-canvas/85">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:font-semibold">Skip to content</a>
      <div className="container-page flex h-16 items-center justify-between gap-3 lg:h-[76px]">
        <Link to="/" className="flex min-w-0 items-center gap-2.5 lg:shrink-0" aria-label="Infant Jesus Tours & Travels — home">
          <LogoMark size={44} />
          {/* Hidden between 1024 and 1280px, where the full navigation needs the room (the logo itself carries the name). */}
          <span className="hidden min-[400px]:block lg:hidden xl:block"><Wordmark /></span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-0.5 lg:flex">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}
              className={({ isActive }) => `relative inline-flex min-h-11 items-center rounded-full px-2.5 text-sm 2xl:px-3 font-medium transition-colors ${isActive ? 'text-ink after:absolute after:inset-x-2.5 2xl:after:inset-x-3 after:bottom-1.5 after:h-0.5 after:rounded-full after:bg-accent' : 'text-ink/70 hover:text-ink'}`}>
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
          <ThemeToggle />
          {signedIn ? (
            <>
              <NotificationBell />
              <Link to="/account" className="btn-secondary px-3.5" aria-label="Account"><UserRound className="h-4 w-4" aria-hidden /><span className="hidden min-[1680px]:inline">Account</span></Link>
              <button type="button" onClick={() => void customer.signOut()} aria-label="Logout" className="hidden h-11 w-11 place-items-center rounded-full text-ink hover:bg-sunken xl:grid"><LogOut className="h-[18px] w-[18px]" aria-hidden /></button>
            </>
          ) : customer.status === 'signedOut' && (
            <>
              <Link to="/login" className="btn-ghost px-3.5">Login</Link>
              <Link to="/register" className="btn-secondary hidden px-3.5 2xl:inline-flex">Register</Link>
            </>
          )}
          <Link to="/book" className="btn-primary ml-1">Book Now</Link>
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          {signedIn && <NotificationBell />}
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? 'Close menu' : 'Open menu'}
            className={`grid h-11 w-11 place-items-center rounded-full border border-line ${open ? 'bg-ink text-canvas' : 'bg-card text-ink'}`}>
            {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-menu" aria-label="Mobile" className="max-h-[calc(100dvh-4rem)] animate-fade-in overflow-y-auto border-t border-line bg-canvas lg:hidden">
          <div className="container-page flex flex-col gap-1 py-3">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'}
                className={({ isActive }) => `flex min-h-12 items-center rounded-xl px-3 text-base font-medium ${isActive ? 'bg-accent-soft font-semibold text-ink' : 'text-ink hover:bg-sunken'}`}>
                {n.label}
              </NavLink>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2.5 border-t border-line pt-3">
              {signedIn ? (
                <>
                  <Link to="/account" className="btn-secondary"><UserRound className="h-4 w-4" aria-hidden />Account</Link>
                  <button type="button" className="btn-secondary" onClick={() => void customer.signOut()}><LogOut className="h-4 w-4" aria-hidden />Logout</button>
                </>
              ) : (
                <>
                  <Link to="/login" className="btn-secondary">Login</Link>
                  <Link to="/register" className="btn-secondary">Register</Link>
                </>
              )}
            </div>
            <div className="flex items-center gap-2.5 pt-2.5">
              <Link to="/book" className="btn-primary flex-1">Book a Vehicle</Link>
              <Link to="/instant-ride" className="btn-secondary flex-1">Instant Ride</Link>
              <ThemeToggle className="border border-line" />
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}

/** Phones: the three things travellers actually do, pinned to the bottom of the screen. */
function MobileActionBar() {
  const contact = useContact();
  const wa = contact.whatsappUrl();
  const { pathname } = useLocation();
  if (pathname.startsWith('/book') || pathname.startsWith('/booking')) return null;   // the booking flow has its own buttons
  const item = 'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold';
  return (
    <nav aria-label="Quick actions" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <div className="flex items-stretch gap-1 px-2 py-1.5">
        {contact.telHref && <a href={contact.telHref} className={`${item} rounded-xl text-ink hover:bg-sunken`}><Phone className="h-5 w-5" aria-hidden />Call</a>}
        {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className={`${item} rounded-xl text-ink hover:bg-sunken`}><MessageCircle className="h-5 w-5 text-success" aria-hidden />WhatsApp</a>}
        <Link to="/book" className={`${item} flex-[1.4] rounded-xl bg-accent text-white`}><CalendarCheck className="h-5 w-5" aria-hidden />Book now</Link>
      </div>
    </nav>
  );
}

const SOCIAL_ICONS = { facebook: FacebookIcon, instagram: InstagramIcon, youtube: YoutubeIcon, linkedin: LinkedinIcon } as const;

function Footer() {
  const { social, page } = useSiteData();
  const contact = useContact();
  const wa = contact.whatsappUrl();
  const col = 'mb-4 font-display text-sm font-semibold text-white';
  const link = 'inline-flex min-h-8 items-center text-sm text-white/65 hover:text-white';
  return (
    <footer className="mt-auto bg-inverse text-white">
      <div className="container-page grid gap-10 pb-8 pt-14 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1.4fr_auto]">
        <div>
          <div className="mb-4 flex items-center gap-3"><LogoMark size={48} /><Wordmark inverse /></div>
          <p className="max-w-xs text-sm leading-relaxed text-white/65">{page('home')?.body || 'Tours, travels and vehicle booking services.'}</p>
        </div>
        <div>
          <h2 className={col}>Explore</h2>
          <ul className="space-y-0.5">{NAV.slice(1, 6).map((n) => <li key={n.to}><Link to={n.to} className={link}>{n.label}</Link></li>)}</ul>
        </div>
        <div>
          <h2 className={col}>Book</h2>
          <ul className="space-y-0.5">
            <li><Link to="/book" className={link}>Book a vehicle</Link></li>
            <li><Link to="/instant-ride" className={link}>Instant ride</Link></li>
            <li><Link to="/packages" className={link}>Tour packages</Link></li>
            <li><Link to="/account" className={link}>My bookings</Link></li>
          </ul>
        </div>
        <div>
          <h2 className={col}>Contact</h2>
          <ul className="space-y-2.5 text-sm text-white/65">
            {contact.address && <li className="flex gap-2.5"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-white/40" aria-hidden /><span>{contact.address}</span></li>}
            {contact.telHref && <li><a href={contact.telHref} className="flex items-center gap-2.5 hover:text-white"><Phone className="h-4 w-4 shrink-0 text-white/40" aria-hidden />{contact.phone}</a></li>}
            {contact.email && <li><a href={`mailto:${contact.email}`} className="flex items-center gap-2.5 break-all hover:text-white"><Mail className="h-4 w-4 shrink-0 text-white/40" aria-hidden />{contact.email}</a></li>}
          </ul>
        </div>
        <div>
          <h2 className={col}>Follow</h2>
          <ul className="flex flex-wrap gap-2">
            {wa && <li><a href={wa} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="grid h-11 w-11 place-items-center rounded-full bg-white/10 hover:bg-white/20"><MessageCircle className="h-[18px] w-[18px]" aria-hidden /></a></li>}
            {(Object.keys(SOCIAL_ICONS) as (keyof typeof SOCIAL_ICONS)[]).map((p) => {
              const href = social[p]; const Icon = SOCIAL_ICONS[p];
              // Only https links are ever rendered (also enforced by a database constraint).
              if (!href || !/^https:\/\//i.test(href)) return null;
              return <li key={p}><a href={href} target="_blank" rel="noopener noreferrer" aria-label={p} className="grid h-11 w-11 place-items-center rounded-full bg-white/10 capitalize hover:bg-white/20"><Icon className="h-[18px] w-[18px]" aria-hidden /></a></li>;
            })}
          </ul>
        </div>
      </div>
      <div className="container-page pb-8"><DeveloperCard /></div>
      <div className="border-t border-white/10">
        <div className="container-page py-5 text-center text-xs text-white/50 sm:text-left">
          © {new Date().getFullYear()} {contact.companyName}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }); }, [pathname]);
  return null;
}

export function SiteLayout() {
  const { settings } = useSiteData();
  const { setSiteDefault } = useTheme();
  const contact = useContact();
  const wa = contact.whatsappUrl();
  // The admin-chosen default applies unless the visitor has picked a theme themselves.
  useEffect(() => { setSiteDefault(settings?.default_theme ?? null); }, [settings?.default_theme, setSiteDefault]);

  return (
    <div className="pb-action-bar flex min-h-dvh flex-col">
      <ScrollToTop />
      <TopBar />
      <Header />
      <main id="main" className="flex-1"><Outlet /></main>
      <Footer />
      <MobileActionBar />
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" aria-label="Chat with us on WhatsApp"
          className="fixed bottom-6 right-6 z-40 hidden h-14 w-14 place-items-center rounded-full bg-[#1FA855] text-white shadow-lift transition-transform hover:scale-105 lg:grid">
          <MessageCircle className="h-6 w-6" aria-hidden />
        </a>
      )}
    </div>
  );
}
