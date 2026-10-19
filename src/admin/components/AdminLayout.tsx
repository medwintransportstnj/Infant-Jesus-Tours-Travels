import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Bell, CalendarCheck, Car, ExternalLink, FileText, Images, Inbox, LayoutDashboard, LogOut, Map, MapPinned, Menu,
  MessageCircle, MessageSquareQuote, Moon, Palette, Search, Settings, Sun, Ticket, Users, X, type LucideIcon,
} from 'lucide-react';
import { LogoMark, Wordmark } from '@/components/site/Logo';
import { useToast } from '@/components/ui/Toast';
import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '../auth';
import { useRealtime } from '../data';

export const ADMIN_NAV: { to: string; label: string; Icon: LucideIcon; end?: boolean }[] = [
  { to: '/admin', label: 'Dashboard', Icon: LayoutDashboard, end: true },
  { to: '/admin/bookings', label: 'Bookings & Enquiries', Icon: CalendarCheck },
  { to: '/admin/vehicles', label: 'Vehicles', Icon: Car },
  { to: '/admin/packages', label: 'Packages', Icon: Map },
  { to: '/admin/destinations', label: 'Destinations', Icon: MapPinned },
  { to: '/admin/offers', label: 'Offers', Icon: Ticket },
  { to: '/admin/pages', label: 'Pages', Icon: FileText },
  { to: '/admin/gallery', label: 'Gallery', Icon: Images },
  { to: '/admin/testimonials', label: 'Testimonials', Icon: MessageSquareQuote },
  { to: '/admin/contacts', label: 'Contacts', Icon: Inbox },
  { to: '/admin/notifications', label: 'Notifications', Icon: Bell },
  { to: '/admin/settings', label: 'Website Settings', Icon: Settings },
  { to: '/admin/social', label: 'WhatsApp & Social', Icon: MessageCircle },
  { to: '/admin/seo', label: 'SEO', Icon: Search },
  { to: '/admin/theme', label: 'Theme', Icon: Palette },
  { to: '/admin/admins', label: 'Admin Management', Icon: Users },
];

function NavList({ unread, onNavigate }: { unread: number; onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {ADMIN_NAV.map(({ to, label, Icon, end }) => (
        <li key={to}>
          <NavLink to={to} end={end} onClick={onNavigate}
            className={({ isActive }) => `flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors ${isActive ? 'bg-accent text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="flex-1">{label}</span>
            {to === '/admin/notifications' && unread > 0 && <span className="rounded-full bg-white px-1.5 text-[11px] font-bold text-accent-strong" aria-label={`${unread} unread`}>{unread > 99 ? '99+' : unread}</span>}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

export function AdminLayout() {
  const { email, signOut } = useAuth();
  const { mode, toggle } = useTheme();
  const toast = useToast();
  const { pathname } = useLocation();
  const [drawer, setDrawer] = useState(false);
  const [unread, setUnread] = useState(0);
  const title = [...ADMIN_NAV].reverse().find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)))?.label ?? 'Admin';

  const refreshUnread = useCallback(async () => {
    const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false);
    if (error) { console.error('[ijt] unread count failed', error); return; }
    setUnread(count ?? 0);
  }, []);
  useEffect(() => { void refreshUnread(); }, [refreshUnread]);
  // New bookings and messages arrive over the socket: badge + toast update without a refresh.
  useRealtime(['notifications'], (_t, payload) => {
    void refreshUnread();
    // Status changes update the badge and list silently: the admin who made the change already saw a confirmation.
    if (payload.eventType === 'INSERT' && typeof payload.new.title === 'string' && payload.new.kind !== 'status') {
      toast.info(payload.new.title, typeof payload.new.body === 'string' ? payload.new.body : undefined);
    }
  }, 0);

  useEffect(() => { setDrawer(false); window.scrollTo({ top: 0 }); }, [pathname]);
  useEffect(() => { document.title = `${title} · Admin`; }, [title]);
  useEffect(() => {
    let robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.appendChild(robots); }
    robots.content = 'noindex, nofollow';
  }, []);

  const iconBtn = 'relative grid h-11 w-11 place-items-center rounded-md';
  const bell = (cls: string) => (
    <Link to="/admin/notifications" className={`${iconBtn} ${cls}`} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
      <Bell className="h-[18px] w-[18px]" aria-hidden />
      {unread > 0 && <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-white" aria-hidden>{unread > 9 ? '9+' : unread}</span>}
    </Link>
  );

  return (
    <div className="min-h-dvh bg-canvas lg:pl-64">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-inverse lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5"><LogoMark size={36} /><Wordmark inverse /></div>
        <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3 pb-4"><NavList unread={unread} /></nav>
        <div className="border-t border-white/10 p-3">
          <p className="truncate px-3 pb-2 text-xs text-white/60" title={email ?? ''}>{email}</p>
          <button type="button" onClick={() => void signOut()} className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white">
            <LogOut className="h-4 w-4" aria-hidden />Sign out
          </button>
        </div>
      </aside>

      {/* mobile top bar */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-2 bg-inverse px-3 text-white lg:hidden">
        <LogoMark size={36} />
        <p className="min-w-0 flex-1 truncate text-center text-[15px] font-semibold">{title}</p>
        {bell('bg-white/10 text-white')}
        <button type="button" onClick={() => setDrawer(true)} aria-label="Open menu" aria-expanded={drawer} className={`${iconBtn} bg-white/10`}><Menu className="h-[18px] w-[18px]" aria-hidden /></button>
      </header>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin menu">
          <div className="absolute inset-0 animate-fade-in bg-inverse/60" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[min(20rem,88vw)] animate-fade-in flex-col bg-inverse">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-semibold text-white">Menu</span>
              <button type="button" autoFocus onClick={() => setDrawer(false)} aria-label="Close menu" className={`${iconBtn} text-white hover:bg-white/10`}><X className="h-5 w-5" aria-hidden /></button>
            </div>
            <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3 pb-3"><NavList unread={unread} onNavigate={() => setDrawer(false)} /></nav>
            <div className="flex flex-col gap-1 border-t border-white/10 p-3">
              <p className="truncate px-3 text-xs text-white/60">{email}</p>
              <Link to="/" className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-white/80 hover:bg-white/10"><ExternalLink className="h-4 w-4" aria-hidden />View website</Link>
              <button type="button" onClick={toggle} className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-white/80 hover:bg-white/10">
                {mode === 'dark' ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}{mode === 'dark' ? 'Light theme' : 'Dark theme'}
              </button>
              <button type="button" onClick={() => void signOut()} className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-white/80 hover:bg-white/10"><LogOut className="h-4 w-4" aria-hidden />Sign out</button>
            </div>
          </div>
        </div>
      )}

      {/* desktop top bar */}
      <header className="sticky top-0 z-30 hidden h-16 items-center justify-between gap-3 border-b border-line bg-card px-8 lg:flex">
        <h1 className="text-xl">{title}</h1>
        <div className="flex items-center gap-2">
          {bell('text-ink hover:bg-sunken')}
          <button type="button" onClick={toggle} aria-label={mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} className={`${iconBtn} text-ink hover:bg-sunken`}>
            {mode === 'dark' ? <Sun className="h-[18px] w-[18px]" aria-hidden /> : <Moon className="h-[18px] w-[18px]" aria-hidden />}
          </button>
          <Link to="/" className="btn-secondary">View website</Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] p-4 sm:p-6 lg:p-8"><Outlet context={{ unread, refreshUnread }} /></main>
    </div>
  );
}

export interface AdminOutletContext { unread: number; refreshUnread: () => Promise<void> }
