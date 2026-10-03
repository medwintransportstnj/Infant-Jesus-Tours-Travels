import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { AdminRole } from '@/types/db';

type Status = 'loading' | 'signedOut' | 'admin';
interface AuthCtx {
  status: Status; email: string | null; userId: string | null; role: AdminRole | null;
  /** True when the session ended without the admin choosing to sign out. */
  expired: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Called by data hooks when the API reports an expired/invalid session. */
  handleExpired: () => void;
}
const AuthContext = createContext<AuthCtx | null>(null);

export class AuthError extends Error {}

/**
 * Authorisation is decided by the database: is_admin() checks public.admins for auth.uid().
 * Nothing in the browser can grant access — hiding the UI is a convenience, RLS is the lock.
 */
async function fetchRole(): Promise<AdminRole | null> {
  const { data: isAdmin, error } = await supabase.rpc('is_admin');
  if (error) throw error;
  if (!isAdmin) return null;
  const { data: isOwner } = await supabase.rpc('is_owner');
  return isOwner ? 'owner' : 'admin';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [expired, setExpired] = useState(false);
  const intentional = useRef(false);

  const clear = useCallback(() => { setStatus('signedOut'); setEmail(null); setUserId(null); setRole(null); }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) { clear(); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!data.session) { clear(); return; }
        const r = await fetchRole();
        if (cancelled) return;
        if (!r) { await supabase.auth.signOut(); clear(); return; }
        setEmail(data.session.user.email ?? null); setUserId(data.session.user.id); setRole(r); setStatus('admin');
      } catch (err) {
        console.error('[ijt] session check failed', err);
        if (!cancelled) clear();
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        if (!intentional.current) setExpired(true);
        intentional.current = false;
        clear();
      }
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [clear]);

  const signIn = useCallback(async (emailInput: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: emailInput.trim(), password });
    if (error || !data.session) {
      // Same message for unknown email and wrong password: never reveal which accounts exist.
      if (error && /fetch|network/i.test(error.message)) throw new AuthError('We could not reach the server. Check your connection and try again.');
      if (error?.status === 429) throw new AuthError('Too many attempts. Please wait a minute and try again.');
      throw new AuthError('Incorrect email or password.');
    }
    let r: AdminRole | null = null;
    try { r = await fetchRole(); } catch (err) { console.error('[ijt] role check failed', err); }
    if (!r) {
      intentional.current = true;
      await supabase.auth.signOut();
      throw new AuthError('This account does not have admin access.');
    }
    setExpired(false);
    setEmail(data.session.user.email ?? null); setUserId(data.session.user.id); setRole(r); setStatus('admin');
  }, []);

  const signOut = useCallback(async () => {
    intentional.current = true;
    setExpired(false);
    const { error } = await supabase.auth.signOut();
    if (error) { console.error('[ijt] sign out failed', error); await supabase.auth.signOut({ scope: 'local' }); }
    clear();
  }, [clear]);

  const handleExpired = useCallback(() => {
    setExpired(true);
    intentional.current = true;
    void supabase.auth.signOut({ scope: 'local' });
    clear();
  }, [clear]);

  const value = useMemo(() => ({ status, email, userId, role, expired, signIn, signOut, handleExpired }),
    [status, email, userId, role, expired, signIn, signOut, handleExpired]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') {
    return <div className="grid min-h-dvh place-items-center bg-canvas" role="status"><Loader2 className="h-6 w-6 animate-spin text-muted" aria-hidden /><span className="sr-only">Checking your session…</span></div>;
  }
  if (status !== 'admin') return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
