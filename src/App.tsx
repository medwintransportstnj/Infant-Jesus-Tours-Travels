import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { SiteDataProvider } from '@/hooks/useSiteData';
import { ThemeProvider } from '@/hooks/useTheme';
import { ToastProvider } from '@/components/ui/Toast';
import { CustomerProvider } from '@/customer/auth';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SiteLayout } from '@/components/site/Layout';
import Home from '@/pages/Home';
import { About, Contact, Destinations, Gallery, NotFound, Offers } from '@/pages/Content';
import { VehicleDetail, Vehicles } from '@/pages/Vehicles';
import { PackageDetail, Packages } from '@/pages/Packages';

// Booking screens and the whole admin are split out so first-time visitors download only the public site.
const BookingFlow = lazy(() => import('@/pages/booking/BookingFlow'));
const Confirmation = lazy(() => import('@/pages/booking/Confirmation'));
const InstantRide = lazy(() => import('@/pages/InstantRide'));
const AdminApp = lazy(() => import('@/admin/AdminApp'));
// Customer account screens load only when visited.
const Account = lazy(() => import('@/customer/pages/Account'));
const authPages = () => import('@/customer/pages/AuthPages');
const Login = lazy(() => authPages().then((m) => ({ default: m.Login })));
const Register = lazy(() => authPages().then((m) => ({ default: m.Register })));
const ForgotPassword = lazy(() => authPages().then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => authPages().then((m) => ({ default: m.ResetPassword })));

const Fallback = () => (
  <div className="grid min-h-[50dvh] place-items-center" role="status"><Loader2 className="h-6 w-6 animate-spin text-muted" aria-hidden /><span className="sr-only">Loading…</span></div>
);

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <SiteDataProvider>
           <CustomerProvider>
            <BrowserRouter>
              <Suspense fallback={<Fallback />}>
                <Routes>
                  <Route path="/admin/*" element={<AdminApp />} />
                  <Route element={<SiteLayout />}>
                    <Route index element={<Home />} />
                    <Route path="vehicles" element={<Vehicles />} />
                    <Route path="vehicles/:id" element={<VehicleDetail />} />
                    <Route path="packages" element={<Packages />} />
                    <Route path="packages/:id" element={<PackageDetail />} />
                    <Route path="destinations" element={<Destinations />} />
                    <Route path="offers" element={<Offers />} />
                    <Route path="gallery" element={<Gallery />} />
                    <Route path="about" element={<About />} />
                    <Route path="contact" element={<Contact />} />
                    <Route path="instant-ride" element={<InstantRide />} />
                    <Route path="book" element={<BookingFlow />} />
                    <Route path="booking/confirmation" element={<Confirmation />} />
                    <Route path="login" element={<Login />} />
                    <Route path="register" element={<Register />} />
                    <Route path="forgot-password" element={<ForgotPassword />} />
                    <Route path="reset-password" element={<ResetPassword />} />
                    <Route path="account" element={<Account />} />
                    <Route path="*" element={<NotFound />} />
                  </Route>
                </Routes>
              </Suspense>
            </BrowserRouter>
           </CustomerProvider>
          </SiteDataProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
