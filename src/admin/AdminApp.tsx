import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useSiteData } from '@/hooks/useSiteData';
import { useTheme } from '@/hooks/useTheme';
import { AuthProvider, RequireAdmin } from './auth';
import { AdminLayout } from './components/AdminLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Bookings from './pages/Bookings';
import { DestinationsAdmin, GalleryAdmin, OffersAdmin, PackagesAdmin, TestimonialsAdmin, VehiclesAdmin } from './pages/Catalogue';
import { Contacts, Notifications } from './pages/Inbox';
import { AdminsPage, PagesAdmin, SeoSettingsPage, SocialSettings, ThemeSettings, WebsiteSettings } from './pages/Settings';

export default function AdminApp() {
  const { settings } = useSiteData();
  const { setSiteDefault } = useTheme();
  useEffect(() => { setSiteDefault(settings?.default_theme ?? null); }, [settings?.default_theme, setSiteDefault]);
  return (
    <AuthProvider>
      <Routes>
        <Route path="login" element={<Login />} />
        {/* Every route below is behind RequireAdmin — and, independently, behind RLS in the database. */}
        <Route element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
          <Route index element={<Dashboard />} />
          <Route path="bookings" element={<Bookings />} />
          <Route path="vehicles" element={<VehiclesAdmin />} />
          <Route path="packages" element={<PackagesAdmin />} />
          <Route path="destinations" element={<DestinationsAdmin />} />
          <Route path="offers" element={<OffersAdmin />} />
          <Route path="pages" element={<PagesAdmin />} />
          <Route path="gallery" element={<GalleryAdmin />} />
          <Route path="testimonials" element={<TestimonialsAdmin />} />
          <Route path="contacts" element={<Contacts />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="settings" element={<WebsiteSettings />} />
          <Route path="social" element={<SocialSettings />} />
          <Route path="seo" element={<SeoSettingsPage />} />
          <Route path="theme" element={<ThemeSettings />} />
          <Route path="admins" element={<AdminsPage />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
