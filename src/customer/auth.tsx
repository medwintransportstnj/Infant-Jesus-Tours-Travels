import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isSupabaseConfigured, siteClient, timeoutSignal } from '@/lib/supabase';
import { useToast } from '@/components/ui/Toast';
import { normalizeEmail } from '@/utils/phone';
import type { CustomerNotification, Profile } from '@/types/db';

// CUSTOMER authentication. Completely separate from src/admin/auth.tsx: different Supabase client,
// different stored session, different context. Passwords are handled only by Supabase Auth.

type Status = 'loading' | 'signedOut' | 'signedIn';
export type AccountErrorCode = 'invalid' | 'exists' | 'weak' | 'network' | 'rate' | 'unknown';
export class AccountError extends Error {
  constructor(public code: AccountErrorCode, message: string) { super(message); }
}
export interface AccountInput { fullName: string; email: string; phone: string; password: string }

interface CustomerCtx {
  status: Status; userId: string | null; email: string | null; profile: Profile | null;
  notifications: CustomerNotification[]; unread: number;
  /** True after the customer arrives from a password-reset email. */
  recovery: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** 'confirmEmail' when the project requires email confirmation before the first sign-in. */
  register: (input: AccountInput) => Promise<'signedIn' | 'confirmEmail'>;
  /** Booking flow: sign in if the account exists and the password is right, otherwise create it. Never overwrites or duplicates an account. */
  ensureAccount: (input: AccountInput) => Promise<'signedIn' | 'confirmEmail'>;
  signOut: () => Promise<void>;
  updateProfile: (values: { full_name: string; phone: string }) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  setNewPassword: (password: string) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}
const CustomerContext = createContext<CustomerCtx | null>(null);

function toAccountError(error: { message?: string; status?: number; code?: string } | null): AccountError {
  const msg = error?.message ?? '';
  if (/fetch|network|load failed/i.test(msg)) return new AccountError('network', 'We could not reach the server. Check your connection and try again.');
  if (error?.status === 429 || /rate limit|too many/i.test(msg)) return new AccountError('rate', 'Too many attempts. Please wait a minute and try again.');
  if (/already registered|already exists|user_already_exists/i.test(`${msg} ${error?.code ?? ''}`)) return new AccountError('exists', 'An account with this email already exists.');
  if (/weak|at least|should be|password/i.test(msg) && !/invalid login/i.test(msg)) return new AccountError('weak', 'Please choose a stronger password (at least 8 characters).');
  if (/invalid login|invalid_credentials|not confirmed/i.test(`${msg} ${error?.code ?? ''}`)) return new AccountError('invalid', 'Incorrect email or password.');
  console.error('[ijt] customer auth error', error);
  return new AccountError('unknown', 'Something went wrong. Please try again.');
}

export function CustomerProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [status, setStatus] = useState<Status>('loading');
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [recovery, setRecovery] = useState(false);
  const seen = useRef(new Set<string>());

  // ---- session: SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, PASSWORD_RECOVERY and expiry all arrive here ----
  useEffect(() => {
    if (!isSupabaseConfigured) { setStatus('signedOut'); return; }
    let cancelled = false;
    const apply = (user: { id: string; email?: string } | null) => {
      if (cancelled) return;
      setUserId(user?.id ?? null); setEmail(user?.email ?? null); setStatus(user ? 'signedIn' : 'signedOut');
      if (!user) { setProfile(null); setNotifications([]); seen.current.clear(); setRecovery(false); }
    };
    siteClient.auth.getSession().then(({ data }) => apply(data.session?.user ?? null)).catch(() => apply(null));
    const { data: sub } = siteClient.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      apply(session?.user ?? null);   // an expired or revoked session arrives as SIGNED_OUT with no session
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  // ---- private data: loaded only for a signed-in customer; anonymous visitors make no such requests ----
  const loadPrivate = useCallback(async (uid: string) => {
    const [p, n] = await Promise.all([
      siteClient.from('profiles').select('*').eq('id', uid).abortSignal(timeoutSignal()).maybeSingle(),
      siteClient.from('customer_notifications').select('*').eq('customer_id', uid).order('created_at', { ascending: false }).limit(30).abortSignal(timeoutSignal()),
    ]);
    if (p.error) console.error('[ijt] profile load failed', p.error); else setProfile(p.data as Profile | null);
    if (n.error) console.error('[ijt] notifications load failed', n.error);
    else { const list = (n.data ?? []) as CustomerNotification[]; list.forEach((x) => seen.current.add(x.id)); setNotifications(list); }
  }, []);

  useEffect(() => {
    if (!userId) return;
    void loadPrivate(userId);
    // Realtime: one channel per signed-in customer, filtered to their rows (RLS enforces the same on the server).
    const channel = siteClient
      .channel(`customer-notifications-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_notifications', filter: `customer_id=eq.${userId}` }, (payload) => {
        const row = payload.new as CustomerNotification;
        if (payload.eventType === 'INSERT' && row?.id) {
          if (seen.current.has(row.id)) return;        // exactly one UI event per notification
          seen.current.add(row.id);
          setNotifications((list) => [row, ...list].slice(0, 30));
          toast.info(row.title, row.body);
        } else if (payload.eventType === 'UPDATE' && row?.id) {
          setNotifications((list) => list.map((x) => (x.id === row.id ? row : x)));
        }
      })
      .subscribe();
    // Catch up after the tab was in the background or the connection dropped (not polling).
    const onVisible = () => { if (document.visibilityState === 'visible') void loadPrivate(userId); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); void siteClient.removeChannel(channel); };
  }, [userId, loadPrivate, toast]);

  // ---- actions ----
  const signIn = useCallback(async (emailInput: string, password: string) => {
    const { error } = await siteClient.auth.signInWithPassword({ email: normalizeEmail(emailInput), password });
    if (error) throw toAccountError(error);
  }, []);

  const register = useCallback(async (input: AccountInput): Promise<'signedIn' | 'confirmEmail'> => {
    const { data, error } = await siteClient.auth.signUp({
      email: normalizeEmail(input.email), password: input.password,
      options: { data: { full_name: input.fullName.trim(), phone: input.phone.trim() }, emailRedirectTo: `${window.location.origin}/account` },
    });
    if (error) throw toAccountError(error);
    if (data.session) return 'signedIn';
    // With email confirmation on, Supabase answers an existing address with an identity-less user.
    if (data.user && (data.user.identities?.length ?? 0) === 0) throw new AccountError('exists', 'An account with this email already exists.');
    return 'confirmEmail';
  }, []);

  const ensureAccount = useCallback(async (input: AccountInput): Promise<'signedIn' | 'confirmEmail'> => {
    const address = normalizeEmail(input.email);
    const attempt = await siteClient.auth.signInWithPassword({ email: address, password: input.password });
    if (!attempt.error && attempt.data.session) {
      // Existing account, correct password: reuse it. Only fill a phone number the profile does not have yet.
      const uid = attempt.data.session.user.id;
      const { data: existing } = await siteClient.from('profiles').select('phone').eq('id', uid).maybeSingle();
      if (existing && !existing.phone && input.phone.trim()) await siteClient.from('profiles').update({ phone: input.phone.trim() }).eq('id', uid);
      return 'signedIn';
    }
    if (attempt.error && /not confirmed/i.test(attempt.error.message)) return 'confirmEmail';
    const failure = toAccountError(attempt.error);
    if (failure.code !== 'invalid') throw failure;
    // Not signed in: either a new customer, or an existing one with the wrong password. signUp tells us which
    // without ever touching the existing account.
    try { return await register(input); }
    catch (err) {
      if (err instanceof AccountError && err.code === 'exists') throw new AccountError('exists', 'An account with this email already exists, but that password does not match it.');
      throw err;
    }
  }, [register]);

  const signOut = useCallback(async () => {
    const { error } = await siteClient.auth.signOut();
    if (error) { console.error('[ijt] customer sign-out failed', error); await siteClient.auth.signOut({ scope: 'local' }); }
  }, []);

  const updateProfile = useCallback(async (values: { full_name: string; phone: string }) => {
    if (!userId) throw new AccountError('invalid', 'Please sign in again.');
    const { data, error } = await siteClient.from('profiles').update({ full_name: values.full_name.trim(), phone: values.phone.trim() }).eq('id', userId).select('*').single();
    if (error) throw error;
    setProfile(data as Profile);
  }, [userId]);

  const requestPasswordReset = useCallback(async (emailInput: string) => {
    const { error } = await siteClient.auth.resetPasswordForEmail(normalizeEmail(emailInput), { redirectTo: `${window.location.origin}/reset-password` });
    // Deliberately silent about whether the address has an account.
    if (error) { const e = toAccountError(error); if (e.code === 'network' || e.code === 'rate') throw e; }
  }, []);

  const setNewPassword = useCallback(async (password: string) => {
    const { error } = await siteClient.auth.updateUser({ password });
    if (error) throw toAccountError(error);
    setRecovery(false);
  }, []);

  const markRead = useCallback(async (id: string) => {
    setNotifications((list) => list.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    const { error } = await siteClient.from('customer_notifications').update({ is_read: true }).eq('id', id);
    if (error) console.error('[ijt] mark read failed', error);
  }, []);
  const markAllRead = useCallback(async () => {
    if (!userId) return;
    setNotifications((list) => list.map((n) => ({ ...n, is_read: true })));
    const { error } = await siteClient.from('customer_notifications').update({ is_read: true }).eq('customer_id', userId).eq('is_read', false);
    if (error) console.error('[ijt] mark all read failed', error);
  }, [userId]);

  const value = useMemo<CustomerCtx>(() => ({
    status, userId, email, profile, notifications, unread: notifications.filter((n) => !n.is_read).length, recovery,
    signIn, register, ensureAccount, signOut, updateProfile, requestPasswordReset, setNewPassword, markRead, markAllRead,
  }), [status, userId, email, profile, notifications, recovery, signIn, register, ensureAccount, signOut, updateProfile, requestPasswordReset, setNewPassword, markRead, markAllRead]);
  return <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>;
}

export function useCustomer(): CustomerCtx {
  const ctx = useContext(CustomerContext);
  if (!ctx) throw new Error('useCustomer must be used inside <CustomerProvider>');
  return ctx;
}

export const MIN_PASSWORD = 8;
export function validatePassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (password !== confirm) return 'The two passwords do not match.';
  return null;
}
