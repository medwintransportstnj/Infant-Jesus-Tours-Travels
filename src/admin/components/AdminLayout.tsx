import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Bell, CalendarCheck, Car, ExternalLink, FileText, Images, Inbox, LayoutDashboard, LogOut, Map, MapPinned, Menu,
  MessageCircle, MessageSquareQuote, Moon, Palette, Search, Settings, Sun, Ticket, Users, X, type LucideIcon,
} from 'lucide-react';
import { LogoMark, Wordmark } from '@/components/site/Logo';
import { LiveIndicator, PushToggle, SoundToggle } from '@/components/ui/LiveControls';
import { NotificationPanel } from '@/components/ui/NotificationPanel';
import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/lib/supabase';
import { useNotificationFeed } from '@/lib/useNotificationFeed';
import { ROLE_LABEL, type AppNotification } from '@/types/db';
import { useAuth } from '../auth';

type NavItem = { to: string; label: string; Icon: LucideIcon; end?: boolean; ownerOnly?: boolean };
export const ADMIN_NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: 'Operations', items: [
    { to: '/admin', label: 'Dashboard', Icon: LayoutDashboard, end: true },
    { to: '/admin/bookings', label: 'Bookings & Enquiries', Icon: CalendarCheck },
    { to: '/admin/contacts', label: 'Contacts', Icon: Inbox },
    { to: '/admin/notifications', label: 'Notifications', Icon: Bell },
  ] },
  { label: 'Website content', items: [
    { to: '/admin/vehicles', label: 'Vehicles', Icon: Car },
    { to: '/admin/packages', label: 'Packages', Icon: Map },
    { to: '/admin/destinations', label: 'Destinations', Icon: MapPinned },
    { to: '/admin/offers', label: 'Offers', Icon: Ticket },
    { to: '/admin/gallery', label: 'Gallery', Icon: Images },
    { to: '/admin/testimonials', label: 'Testimonials', Icon: MessageSquareQuote },
  ] },
  { label: 'Settings', items: [
    { to: '/admin/pages', label: 'Pages', Icon: FileText, ownerOnly: true },
    { to: '/admin/settings', label: 'Website Settings', Icon: Settings, ownerOnly: true },
    { to: '/admin/social', label: 'WhatsApp & Social', Icon: MessageCircle, ownerOnly: true },
    { to: '/admin/seo', label: 'SEO', Icon: Search, ownerOnly: true },
    { to: '/admin/theme', label: 'Theme', Icon: Palette, ownerOnly: true },
    { to: '/admin/admins', label: 'Staff & Drivers', Icon: Users, ownerOnly: true },
  ] },
];
export const ADMIN_NAV: NavItem[] = ADMIN_NAV_GROUPS.flatMap((g) => g.items);
/** Routes office staff cannot open (the database refuses their changes too). */
export const OWNER_ONLY_PATHS = ADMIN_NAV.filter((n) => n.ownerOnly).map((n) => n.to);

/** Where a staff notification leads when opened. */
export function staffLink(n: AppNotification): string {
  const ref = n.title.match(/IJT-\d+/)?.[0];
  if (n.kind === 'message') return '/admin/contacts';
  return ref ? `/admin/bookings?q=${encodeURIComponent(ref)}` : '/admin/notifications';
}

function NavList({ unread, isOwner, onNavigate }: { unread: number; isOwner: boolean; onNavigate?: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      {ADMIN_NAV_GROUPS.map((group) => {
        const items = group.items.filter((i) => isOwner || !i.ownerOnly);
        if (!items.length) return null;
        return (
          <div key={group.label}>
            <p className="px-3 pb-1.5 text-xs font-medium text-white/45">{group.label}</p>
            <ul className="flex flex-col gap-0.5">
              {items.map(({ to, label, Icon, end }) => (
                <li key={to}>
                  <NavLink to={to} end={end} onClick={onNavigate}
                    className={({ isActive }) => `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${isActive ? 'bg-accent text-white shadow-sm' : 'text-white/70 hover:bg-white/[0.07] hover:text-white'}`}>
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="flex-1">{label}</span>
                    {to === '/admin/notifications' && unread > 0 && <span className="rounded-full bg-white px-1.5 text-[11px] font-bold text-accent-strong" aria-label={`${unread} unread`}>{unread > 99 ? '99+' : unread}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function AdminLayout() {
  const { email, userId, role, signOut } = useAuth();
  const { mode, toggle } = useTheme();
  const { pathname } = useLocation();
  const [drawer, setDrawer] = useState(false);
  const isOwner = role === 'owner';
  const title = [...ADMIN_NAV].reverse().find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)))?.label ?? 'Admin';

  // The office inbox: live list, unread badge, popup + chime for events caused by someone else.
  const feed = useNotificationFeed<AppNotification>({ client: supabase, table: 'notifications', userId, linkFor: staffLink });

  useEffect(() => { setDrawer(false); window.scrollTo({ top: 0 }); }, [pathname]);
  useEffect(() => { document.title = `${title} · Admin`; }, [title]);
  useEffect(() => {
    let robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.appendChild(robots); }
    robots.content = 'noindex, nofollow';
  }, []);

  const iconBtn = 'relative grid h-11 w-11 place-items-center rounded-full';
  const bell = (cls: string, inverse = false) => (
    <NotificationPanel items={feed.items} unread={feed.unread} onMarkRead={(id) => void feed.markRead(id)} onMarkAll={() => void feed.markAllRead()}
      linkFor={staffLink} buttonClassName={cls} inverse={inverse} emptyText="New bookings, enquiries and messages appear here as they arrive."
      footer={<>
        <div className="flex flex-wrap items-center justify-between gap-1"><SoundToggle /><Link to="/admin/notifications" className="link inline-flex min-h-11 items-center px-3 text-sm">View all</Link></div>
        <PushToggle client={supabase} userId={userId} />
      </>} />
  );
  const roleBadge = role ? <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/80">{ROLE_LABEL[role]}</span> : null;

  return (
    <div className="min-h-dvh bg-canvas lg:pl-[17rem]">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-[17rem] flex-col bg-inverse lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5"><LogoMark size={38} /><Wordmark inverse /></div>
        <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3 pb-4"><NavList unread={feed.unread} isOwner={isOwner} /></nav>
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-2 px-3 pb-2"><p className="min-w-0 flex-1 truncate text-xs text-white/60" title={email ?? ''}>{email}</p>{roleBadge}</div>
          <button type="button" onClick={() => void signOut()} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-white/70 hover:bg-white/[0.07] hover:text-white">
            <LogOut className="h-4 w-4" aria-hidden />Sign out
          </button>
        </div>
      </aside>

      {/* mobile top bar */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-2 bg-inverse px-3 text-white lg:hidden">
        <LogoMark size={36} />
        <div className="min-w-0 flex-1 text-center"><p className="truncate text-[15px] font-semibold">{title}</p></div>
        <LiveIndicator inverse className="hidden xs:inline-flex" />
        {bell('bg-white/10 text-white hover:bg-white/15', true)}
        <button type="button" onClick={() => setDrawer(true)} aria-label="Open menu" aria-expanded={drawer} className={`${iconBtn} bg-white/10`}><Menu className="h-[18px] w-[18px]" aria-hidden /></button>
      </header>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin menu">
          <div className="absolute inset-0 animate-fade-in bg-inverse/60" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[min(20rem,88vw)] animate-fade-in flex-col bg-inverse">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-white">Menu {roleBadge}</span>
              <button type="button" autoFocus onClick={() => setDrawer(false)} aria-label="Close menu" className={`${iconBtn} text-white hover:bg-white/10`}><X className="h-5 w-5" aria-hidden /></button>
            </div>
            <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3 pb-3"><NavList unread={feed.unread} isOwner={isOwner} onNavigate={() => setDrawer(false)} /></nav>
            <div className="flex flex-col gap-1 border-t border-white/10 p-3">
              <p className="truncate px-3 text-xs text-white/60">{email}</p>
              <Link to="/" className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-white/80 hover:bg-white/10"><ExternalLink className="h-4 w-4" aria-hidden />View website</Link>
              <button type="button" onClick={toggle} className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-white/80 hover:bg-white/10">
                {mode === 'dark' ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}{mode === 'dark' ? 'Light theme' : 'Dark theme'}
              </button>
              <button type="button" onClick={() => void signOut()} className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-white/80 hover:bg-white/10"><LogOut className="h-4 w-4" aria-hidden />Sign out</button>
            </div>
          </div>
        </div>
      )}

      {/* desktop top bar */}
      <header className="sticky top-0 z-30 hidden h-[4.5rem] items-center justify-between gap-3 border-b border-line bg-card/90 px-8 backdrop-blur lg:flex">
        <h1 className="text-xl font-semibold">{title}</h1>
        <div className="flex items-center gap-2">
          <LiveIndicator />
          {bell('text-ink hover:bg-sunken')}
          <button type="button" onClick={toggle} aria-label={mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} className={`${iconBtn} text-ink hover:bg-sunken`}>
            {mode === 'dark' ? <Sun className="h-[18px] w-[18px]" aria-hidden /> : <Moon className="h-[18px] w-[18px]" aria-hidden />}
          </button>
          <Link to="/" className="btn-secondary">View website</Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] p-4 sm:p-6 lg:p-8"><Outlet context={{ unread: feed.unread, refreshUnread: feed.reload }} /></main>
    </div>
  );
}

export interface AdminOutletContext { unread: number; refreshUnread: () => Promise<void> }
