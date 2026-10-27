import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isSupabaseConfigured, siteClient, timeoutSignal } from '@/lib/supabase';
import { forgetThisDevice } from '@/lib/push';
import { useNotificationFeed } from '@/lib/useNotificationFeed';
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
  const [status, setStatus] = useState<Status>('loading');
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [recovery, setRecovery] = useState(false);

  // ---- session: SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, PASSWORD_RECOVERY and expiry all arrive here ----
  useEffect(() => {
    if (!isSupabaseConfigured) { setStatus('signedOut'); return; }
    let cancelled = false;
    const apply = (user: { id: string; email?: string } | null) => {
      if (cancelled) return;
      setUserId(user?.id ?? null); setEmail(user?.email ?? null); setStatus(user ? 'signedIn' : 'signedOut');
      if (!user) { setProfile(null); setRecovery(false); }
    };
    siteClient.auth.getSession().then(({ data }) => apply(data.session?.user ?? null)).catch(() => apply(null));
    const { data: sub } = siteClient.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      apply(session?.user ?? null);   // an expired or revoked session arrives as SIGNED_OUT with no session
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  // ---- private data: loaded only for a signed-in customer; anonymous visitors make no such requests ----
  const loadProfile = useCallback(async (uid: string) => {
    const p = await siteClient.from('profiles').select('*').eq('id', uid).abortSignal(timeoutSignal()).maybeSingle();
    if (p.error) console.error('[ijt] profile load failed', p.error); else setProfile(p.data as Profile | null);
  }, []);
  useEffect(() => { if (userId) void loadProfile(userId); }, [userId, loadProfile]);

  // Own notifications, live: list + unread count + popup and chime (shared with staff and drivers).
  const feed = useNotificationFeed<CustomerNotification>({
    client: siteClient, table: 'customer_notifications', ownerColumn: 'customer_id', userId, linkFor: () => '/account',
  });

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
    await forgetThisDevice(siteClient);   // stop this device's notifications for this customer (needs the session)
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

  const value = useMemo<CustomerCtx>(() => ({
    status, userId, email, profile, notifications: feed.items, unread: feed.unread, recovery,
    signIn, register, ensureAccount, signOut, updateProfile, requestPasswordReset, setNewPassword,
    markRead: feed.markRead, markAllRead: feed.markAllRead,
  }), [status, userId, email, profile, feed.items, feed.unread, feed.markRead, feed.markAllRead, recovery, signIn, register, ensureAccount, signOut, updateProfile, requestPasswordReset, setNewPassword]);
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
