import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { Seo } from '@/components/site/Seo';
import { Button } from '@/components/ui/Button';
import { Field, FormError } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { validateEmail, validateName, validatePhone } from '@/utils/validation';
import { AccountError, useCustomer, validatePassword } from '../auth';

function Shell({ title, intro, children, footer }: { title: string; intro: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="container-page flex justify-center py-10 sm:py-16">
      <div className="w-full max-w-md">
        <h1 className="text-[28px] leading-tight sm:text-3xl">{title}</h1>
        <p className="mb-6 mt-2 text-[15px] text-muted">{intro}</p>
        <div className="card p-5 sm:p-6">{children}</div>
        {footer && <p className="mt-5 text-center text-sm text-muted">{footer}</p>}
      </div>
    </div>
  );
}
const message = (err: unknown) => (err instanceof AccountError ? err.message : 'Something went wrong. Please try again.');
function Notice({ children }: { children: ReactNode }) {
  return <div role="status" className="flex items-start gap-2.5 rounded-md border border-success/40 bg-success-soft px-3.5 py-3 text-sm text-success"><MailCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span className="text-ink">{children}</span></div>;
}
/** Where to go after signing in: back to the page that asked, never to /admin and never off-site. */
function useReturnTo(): string {
  const from = (useLocation().state as { from?: string } | null)?.from;
  return from && from.startsWith('/') && !from.startsWith('//') && !from.startsWith('/admin') ? from : '/account';
}

export function Login() {
  const customer = useCustomer();
  const returnTo = useReturnTo();
  const state = useLocation().state;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (customer.status === 'signedIn') return <Navigate to={returnTo} replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (validateEmail(email, true) || !password) { setError('Enter your email and password.'); return; }
    setBusy(true); setError(null);
    try { await customer.signIn(email, password); } catch (err) { setError(message(err)); setBusy(false); }
  };
  return (
    <Shell title="Login" intro="Sign in to see your bookings and updates."
      footer={<>New here? <Link to="/register" state={state} className="link">Create an account</Link></>}>
      <Seo title="Login" noindex />
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label="Email" required><input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password" required><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <FormError>{error}</FormError>
        <Button type="submit" block loading={busy} loadingText="Signing in…">Login</Button>
        <Link to="/forgot-password" className="link self-center text-sm">Forgot your password?</Link>
      </form>
    </Shell>
  );
}

export function Register() {
  const customer = useCustomer();
  const returnTo = useReturnTo();
  const state = useLocation().state;
  const [f, setF] = useState({ fullName: '', email: '', phone: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof f, string | null>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReactNode>(null);
  const [confirmSent, setConfirmSent] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  if (customer.status === 'signedIn') return <Navigate to={returnTo} replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const next = { fullName: validateName(f.fullName), email: validateEmail(f.email, true), phone: validatePhone(f.phone), password: validatePassword(f.password, f.confirm) };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setBusy(true); setError(null);
    try {
      if ((await customer.register(f)) === 'confirmEmail') setConfirmSent(true);
    } catch (err) {
      setError(err instanceof AccountError && err.code === 'exists'
        ? <>An account with this email already exists. <Link to="/login" className="link">Login</Link> or <Link to="/forgot-password" className="link">reset your password</Link>.</>
        : message(err));
    } finally { setBusy(false); }
  };
  return (
    <Shell title="Register" intro="Create an account to book vehicles and follow your requests."
      footer={<>Already registered? <Link to="/login" state={state} className="link">Login</Link></>}>
      <Seo title="Register" noindex />
      {confirmSent ? <Notice>We sent a confirmation link to <strong>{f.email.trim()}</strong>. Open it to finish creating your account, then log in.</Notice> : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field label="Full name" required error={errors.fullName}><input className="input" autoComplete="name" maxLength={80} value={f.fullName} onChange={(e) => set('fullName', e.target.value)} /></Field>
          <Field label="Email" required error={errors.email}><input className="input" type="email" autoComplete="email" maxLength={160} value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Phone number" required error={errors.phone}><input className="input" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Password" required error={errors.password} hint="At least 8 characters."><input className="input" type="password" autoComplete="new-password" value={f.password} onChange={(e) => set('password', e.target.value)} /></Field>
          <Field label="Confirm password" required><input className="input" type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => set('confirm', e.target.value)} /></Field>
          <FormError>{error}</FormError>
          <Button type="submit" block loading={busy} loadingText="Creating account…">Register</Button>
        </form>
      )}
    </Shell>
  );
}

export function ForgotPassword() {
  const customer = useCustomer();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const invalid = validateEmail(email, true);
    if (invalid) { setError(invalid); return; }
    setBusy(true); setError(null);
    try { await customer.requestPasswordReset(email); setSent(true); } catch (err) { setError(message(err)); } finally { setBusy(false); }
  };
  return (
    <Shell title="Reset your password" intro="Enter your account email and we will send a reset link." footer={<Link to="/login" className="link">Back to login</Link>}>
      <Seo title="Reset password" noindex />
      {/* Same answer whether or not the address has an account. */}
      {sent ? <Notice>If an account exists for <strong>{email.trim()}</strong>, a reset link is on its way. Check your inbox and spam folder.</Notice> : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field label="Email" required><input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <FormError>{error}</FormError>
          <Button type="submit" block loading={busy} loadingText="Sending…">Send reset link</Button>
        </form>
      )}
    </Shell>
  );
}

export function ResetPassword() {
  const customer = useCustomer();
  const navigate = useNavigate();
  const toast = useToast();
  const [pw, setPw] = useState({ password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const invalid = validatePassword(pw.password, pw.confirm);
    if (invalid) { setError(invalid); return; }
    setBusy(true); setError(null);
    try { await customer.setNewPassword(pw.password); toast.success('Password changed'); navigate('/account', { replace: true }); }
    catch (err) { setError(message(err)); setBusy(false); }
  };
  return (
    <Shell title="Choose a new password" intro="Use the link from your email on this device, then set a new password.">
      <Seo title="New password" noindex />
      {customer.status === 'loading' ? <p className="text-sm text-muted" role="status">Checking your link…</p>
        : customer.status !== 'signedIn' ? (
          <div className="flex flex-col gap-4">
            <FormError>This reset link is invalid or has expired.</FormError>
            <Link to="/forgot-password" className="btn-primary">Request a new link</Link>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <Field label="New password" required hint="At least 8 characters."><input className="input" type="password" autoComplete="new-password" value={pw.password} onChange={(e) => setPw((p) => ({ ...p, password: e.target.value }))} /></Field>
            <Field label="Confirm new password" required><input className="input" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} /></Field>
            <FormError>{error}</FormError>
            <Button type="submit" block loading={busy} loadingText="Saving…">Save password</Button>
          </form>
        )}
    </Shell>
  );
}
