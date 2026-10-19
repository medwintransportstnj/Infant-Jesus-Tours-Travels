import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Clock, Eye, EyeOff } from 'lucide-react';
import { LogoMark, Wordmark } from '@/components/site/Logo';
import { Button } from '@/components/ui/Button';
import { Field, FormError } from '@/components/ui/Field';
import { isSupabaseConfigured } from '@/lib/supabase';
import { AuthError, useAuth } from '../auth';

export default function Login() {
  const { status, signIn, expired } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { document.title = 'Admin login'; }, []);
  const from = (location.state as { from?: string } | null)?.from;

  if (status === 'admin') return <Navigate to={from && from.startsWith('/admin') && from !== '/admin/login' ? from : '/admin'} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    setBusy(true); setError(null);
    try { await signIn(email, password); }
    catch (err) {
      if (!(err instanceof AuthError)) console.error('[ijt] sign-in failed', err);
      setError(err instanceof AuthError ? err.message : 'Something went wrong signing in. Please try again.');
    } finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(320px,2fr)_3fr]">
      <aside className="flex flex-col justify-between gap-8 bg-inverse p-6 text-white sm:p-10">
        <Link to="/" className="flex items-center gap-2.5"><LogoMark /><Wordmark inverse /></Link>
        <p className="hidden text-3xl font-semibold leading-tight lg:block">Manage journeys<br />with clarity.</p>
        <p className="hidden text-xs font-medium uppercase tracking-wider text-white/60 lg:block">Authorized admin access</p>
      </aside>
      <main className="flex items-start justify-center p-5 sm:p-10 lg:items-center">
        <form onSubmit={submit} noValidate className="w-full max-w-sm">
          <h1 className="text-2xl">Admin login</h1>
          <p className="mb-6 mt-1 text-sm text-muted">Enter your authorized account details.</p>
          {expired && (
            <div role="status" className="mb-4 flex items-start gap-2.5 rounded-md bg-warning-soft px-3.5 py-3 text-sm text-warning">
              <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span><span className="block font-semibold">Session expired</span>Sign in again to continue securely.</span>
            </div>
          )}
          {!isSupabaseConfigured && <div className="mb-4"><FormError>The site is not connected to Supabase yet. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</FormError></div>}
          <div className="flex flex-col gap-4">
            <Field label="Email" required><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="admin@example.com" /></Field>
            <div className="relative">
              <Field label="Password" required><input className="input pr-12" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Enter password" /></Field>
              <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}
                className="absolute bottom-0 right-0 grid h-11 w-11 place-items-center text-muted hover:text-ink">
                {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
              </button>
            </div>
            <FormError>{error}</FormError>
            <Button type="submit" loading={busy} loadingText="Signing in…" block disabled={!isSupabaseConfigured}>Sign in</Button>
          </div>
          <p className="mt-6 text-center text-sm"><Link to="/" className="link">Back to website</Link></p>
        </form>
      </main>
    </div>
  );
}
