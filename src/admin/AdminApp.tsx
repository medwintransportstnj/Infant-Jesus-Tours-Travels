import { useEffect, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { EmptyState } from '@/components/ui/Feedback';
import { useSiteData } from '@/hooks/useSiteData';
import { useTheme } from '@/hooks/useTheme';
import { AuthProvider, RequireAdmin, useAuth } from './auth';
import DriverApp from './driver/DriverApp';
import { AdminLayout } from './components/AdminLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Bookings from './pages/Bookings';
import { DestinationsAdmin, GalleryAdmin, OffersAdmin, PackagesAdmin, TestimonialsAdmin, VehiclesAdmin } from './pages/Catalogue';
import { Contacts, Notifications } from './pages/Inbox';
import { AdminsPage, PagesAdmin, SeoSettingsPage, SocialSettings, ThemeSettings, WebsiteSettings } from './pages/Settings';

/** Settings pages are the owner's. Office staff see an explanation; the database refuses their changes anyway. */
function OwnerOnly({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  if (role === 'owner') return <>{children}</>;
  return <EmptyState icon={<ShieldCheck className="h-6 w-6" aria-hidden />} title="Only the owner can change this"
    body="Website settings, WhatsApp number, SEO, theme, page text and staff accounts are managed by the owner." action={<Link to="/admin" className="btn-secondary">Back to dashboard</Link>} />;
}

/** Office staff and owners get the dashboard; drivers get their own trip screens. */
function StaffRoutes() {
  const { role } = useAuth();
  if (role === 'driver') return <DriverApp />;
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="bookings" element={<Bookings />} />
        <Route path="vehicles" element={<VehiclesAdmin />} />
        <Route path="packages" element={<PackagesAdmin />} />
        <Route path="destinations" element={<DestinationsAdmin />} />
        <Route path="offers" element={<OffersAdmin />} />
        <Route path="pages" element={<OwnerOnly><PagesAdmin /></OwnerOnly>} />
        <Route path="gallery" element={<GalleryAdmin />} />
        <Route path="testimonials" element={<TestimonialsAdmin />} />
        <Route path="contacts" element={<Contacts />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="settings" element={<OwnerOnly><WebsiteSettings /></OwnerOnly>} />
        <Route path="social" element={<OwnerOnly><SocialSettings /></OwnerOnly>} />
        <Route path="seo" element={<OwnerOnly><SeoSettingsPage /></OwnerOnly>} />
        <Route path="theme" element={<OwnerOnly><ThemeSettings /></OwnerOnly>} />
        <Route path="admins" element={<OwnerOnly><AdminsPage /></OwnerOnly>} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}

export default function AdminApp() {
  const { settings } = useSiteData();
  const { setSiteDefault } = useTheme();
  useEffect(() => { setSiteDefault(settings?.default_theme ?? null); }, [settings?.default_theme, setSiteDefault]);
  return (
    <AuthProvider>
      <Routes>
        <Route path="login" element={<Login />} />
        {/* Every route below is behind RequireAdmin — and, independently, behind RLS in the database. */}
        <Route path="*" element={<RequireAdmin><StaffRoutes /></RequireAdmin>} />
      </Routes>
    </AuthProvider>
  );
}
