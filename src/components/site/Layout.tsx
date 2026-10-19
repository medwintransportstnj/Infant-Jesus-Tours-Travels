import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { LogOut, Mail, MapPin, Menu, MessageCircle, Moon, Phone, Sun, UserRound, X } from 'lucide-react';
import { FacebookIcon, InstagramIcon, LinkedinIcon, YoutubeIcon } from './BrandIcons';
import { useSiteData } from '@/hooks/useSiteData';
import { useContact } from '@/hooks/useContact';
import { useTheme } from '@/hooks/useTheme';
import { useCustomer } from '@/customer/auth';
import { NotificationBell } from '@/customer/NotificationBell';
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
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-md border border-line bg-card text-ink hover:bg-surface ${className}`}>
      {mode === 'dark' ? <Sun className="h-[18px] w-[18px]" aria-hidden /> : <Moon className="h-[18px] w-[18px]" aria-hidden />}
    </button>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const contact = useContact();
  const customer = useCustomer();
  const signedIn = customer.status === 'signedIn';
  const wa = contact.whatsappUrl();
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const quick = 'flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-md text-[10px] font-semibold text-ink hover:bg-sunken';
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:font-semibold">Skip to content</a>
      <div className="container-page flex h-16 items-center justify-between gap-3 lg:h-[72px]">
        <Link to="/" className="flex min-w-0 items-center gap-2.5" aria-label={`${contact.companyName} — home`}>
          <LogoMark />
          {/* Hidden between 1024 and 1280px, where the full navigation needs the room (the logo itself carries the name). */}
          <span className="hidden min-[400px]:block lg:hidden xl:block"><Wordmark /></span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-0.5 lg:flex">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}
              className={({ isActive }) => `inline-flex min-h-11 items-center rounded-md px-2.5 text-sm font-medium transition-colors xl:px-3 ${isActive ? 'font-semibold text-accent-text' : 'text-ink/80 hover:text-ink'}`}>
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          <ThemeToggle />
          {signedIn ? (
            <>
              <NotificationBell />
              <Link to="/account" className="btn-secondary px-3" aria-label="Account"><UserRound className="h-4 w-4" aria-hidden /><span className="hidden 2xl:inline">Account</span></Link>
              <button type="button" onClick={() => void customer.signOut()} aria-label="Logout" className="hidden h-11 w-11 place-items-center xl:grid rounded-md border border-line bg-card text-ink hover:bg-surface"><LogOut className="h-[18px] w-[18px]" aria-hidden /></button>
            </>
          ) : customer.status === 'signedOut' && (
            <>
              <Link to="/login" className="btn-ghost px-3">Login</Link>
              <Link to="/register" className="btn-secondary hidden px-3 2xl:inline-flex">Register</Link>
            </>
          )}
          <Link to="/book" className="btn-primary">Book Now</Link>
        </div>

        <div className="flex items-center gap-0.5 lg:hidden">
          {contact.telHref && <a href={contact.telHref} className={quick}><Phone className="h-[18px] w-[18px]" aria-hidden />Call</a>}
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className={`${quick} ${signedIn ? 'hidden xs:flex' : ''}`}><MessageCircle className="h-[18px] w-[18px]" aria-hidden />WhatsApp</a>}
          {signedIn && <NotificationBell className="mx-0.5" />}
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="mobile-menu"
            className={`${quick} ${open ? 'bg-accent-soft text-accent-text' : 'bg-accent-soft/60 text-accent-text'}`}>
            {open ? <X className="h-[18px] w-[18px]" aria-hidden /> : <Menu className="h-[18px] w-[18px]" aria-hidden />}Menu
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-menu" aria-label="Mobile" className="max-h-[calc(100dvh-4rem)] animate-fade-in overflow-y-auto border-t border-line bg-surface lg:hidden">
          <div className="container-page flex flex-col gap-1 py-3">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'}
                className={({ isActive }) => `flex min-h-11 items-center rounded-md px-3 text-[15px] font-medium ${isActive ? 'bg-accent-soft font-semibold text-ink' : 'text-ink hover:bg-sunken'}`}>
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
              <ThemeToggle />
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}

const SOCIAL_ICONS = { facebook: FacebookIcon, instagram: InstagramIcon, youtube: YoutubeIcon, linkedin: LinkedinIcon } as const;

function Footer() {
  const { social, page } = useSiteData();
  const contact = useContact();
  const wa = contact.whatsappUrl();
  const col = 'mb-3 text-sm font-semibold text-white';
  const link = 'inline-flex min-h-8 items-center text-sm text-white/70 hover:text-white';
  return (
    <footer className="mt-auto bg-inverse text-white">
      <div className="container-page grid gap-10 pb-8 pt-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr_1fr]">
        <div>
          <div className="mb-4 flex items-center gap-2.5"><LogoMark size={36} /><Wordmark inverse /></div>
          <p className="max-w-xs text-sm leading-relaxed text-white/70">{page('home')?.body || 'Tours, travels and vehicle booking services.'}</p>
        </div>
        <div>
          <h2 className={col}>Quick links</h2>
          <ul className="space-y-0.5">{NAV.slice(0, 5).map((n) => <li key={n.to}><Link to={n.to} className={link}>{n.label}</Link></li>)}</ul>
        </div>
        <div>
          <h2 className={col}>Services</h2>
          <ul className="space-y-0.5">
            <li><Link to="/book" className={link}>Vehicle booking</Link></li>
            <li><Link to="/instant-ride" className={link}>Instant ride</Link></li>
            <li><Link to="/packages" className={link}>Tour packages</Link></li>
            <li><Link to="/contact" className={link}>Custom journeys</Link></li>
          </ul>
        </div>
        <div>
          <h2 className={col}>Contact</h2>
          <ul className="space-y-2 text-sm text-white/70">
            {contact.address && <li className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{contact.address}</span></li>}
            {contact.telHref && <li><a href={contact.telHref} className="flex items-center gap-2 hover:text-white"><Phone className="h-4 w-4 shrink-0" aria-hidden />{contact.phone}</a></li>}
            {contact.email && <li><a href={`mailto:${contact.email}`} className="flex items-center gap-2 break-all hover:text-white"><Mail className="h-4 w-4 shrink-0" aria-hidden />{contact.email}</a></li>}
          </ul>
        </div>
        <div>
          <h2 className={col}>Follow</h2>
          <ul className="flex flex-wrap gap-2">
            {wa && <li><a href={wa} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="grid h-11 w-11 place-items-center rounded-md bg-white/10 hover:bg-white/20"><MessageCircle className="h-[18px] w-[18px]" aria-hidden /></a></li>}
            {(Object.keys(SOCIAL_ICONS) as (keyof typeof SOCIAL_ICONS)[]).map((p) => {
              const href = social[p]; const Icon = SOCIAL_ICONS[p];
              // Only https links are ever rendered (also enforced by a database constraint).
              if (!href || !/^https:\/\//i.test(href)) return null;
              return <li key={p}><a href={href} target="_blank" rel="noopener noreferrer" aria-label={p} className="grid h-11 w-11 place-items-center rounded-md bg-white/10 capitalize hover:bg-white/20"><Icon className="h-[18px] w-[18px]" aria-hidden /></a></li>;
            })}
          </ul>
        </div>
      </div>
      <div className="container-page pb-8"><DeveloperCard /></div>
      <div className="border-t border-white/10">
        <div className="container-page py-5 text-center text-xs text-white/60 sm:text-left">
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
    <div className="flex min-h-dvh flex-col">
      <ScrollToTop />
      <Header />
      <main id="main" className="flex-1"><Outlet /></main>
      <Footer />
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" aria-label="Chat with us on WhatsApp"
          className="fixed bottom-5 right-5 z-40 hidden h-14 w-14 place-items-center rounded-full bg-[#1FA855] text-white shadow-lift transition-transform hover:scale-105 lg:grid">
          <MessageCircle className="h-6 w-6" aria-hidden />
        </a>
      )}
    </div>
  );
}
