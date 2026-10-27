import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Check, MessageCircle, Moon, Pencil, ShieldCheck, Sun, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, FormError } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { ErrorState, Skeleton } from '@/components/ui/Feedback';
import { supabase, timeoutSignal } from '@/lib/supabase';
import { formatDateTime } from '@/utils/format';
import { buildWhatsAppUrl } from '@/utils/whatsapp';
import { EMAIL_RE, PHONE_RE } from '@/utils/validation';
import { ROLE_LABEL, type AdminRole, type AdminUser, type PageContent, type SeoSettings, type SiteSettings, type SocialLink, type SocialPlatform, type ThemeMode } from '@/types/db';
import { useAuth } from '../auth';
import { ImageUploader } from '../components/ImageUploader';
import { PageIntro } from '../components/ResourcePage';
import { NO_IMAGE_CHANGE, persistWithImage, uploadErrorMessage, useApiError, useTable, type ImageDraft } from '../data';

/** Loads and saves a one-row settings table (id = 1). */
function useSingleton<T extends { id: number }>(table: string) {
  const [row, setRow] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const apiError = useApiError();
  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from(table).select('*').eq('id', 1).abortSignal(timeoutSignal()).maybeSingle();
    if (err) setError(apiError(err, 'Could not load these settings. Check the connection and try again.'));
    else { setRow(data as T | null); setError(null); }
    setLoading(false);
  }, [table, apiError]);
  useEffect(() => { void load(); }, [load]);
  const save = useCallback(async (values: Partial<T>) => {
    // UPDATE the existing row (a partial upsert would fail NOT NULL checks); INSERT only on a brand-new database.
    const { data, error: err } = await supabase.from(table).update(values as never).eq('id', 1).select('*');
    if (err) throw err;
    if (data?.length) { setRow(data[0] as T); return; }
    const created = await supabase.from(table).insert({ id: 1, ...values } as never).select('*').single();
    if (created.error) throw created.error;
    setRow(created.data as T);
  }, [table]);
  return { row, loading, error, reload: load, save };
}

function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="card max-w-3xl p-4 sm:p-6">
      <h2 className="text-lg">{title}</h2>
      {description && <p className="mb-4 mt-1 text-[13px] text-muted">{description}</p>}
      <div className={description ? '' : 'mt-4'}>{children}</div>
    </section>
  );
}
const LoadingPanel = () => <div className="max-w-3xl space-y-3" role="status" aria-label="Loading"><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /><Skeleton className="h-24 w-full" /></div>;

// ---------------- Website settings ----------------
export function WebsiteSettings() {
  const { row, loading, error, reload, save } = useSingleton<SiteSettings>('site_settings');
  const toast = useToast();
  const apiError = useApiError();
  const [f, setF] = useState({ company_name: '', phone: '', email: '', address: '', map_embed_url: '' });
  const [logoMain, setLogoMain] = useState<ImageDraft>(NO_IMAGE_CHANGE);
  const [logoSecond, setLogoSecond] = useState<ImageDraft>(NO_IMAGE_CHANGE);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  useEffect(() => { if (row) setF({ company_name: row.company_name, phone: row.phone, email: row.email, address: row.address, map_embed_url: row.map_embed_url }); }, [row]);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  /** Accepts either the embed URL or the whole <iframe> snippet Google gives you, and keeps only a Google Maps embed URL. */
  const cleanMap = (input: string): string | null => {
    const value = input.trim();
    if (!value) return '';
    const url = value.match(/src=["']([^"']+)["']/i)?.[1] ?? value;
    return /^https:\/\/www\.google\.com\/maps\/embed\?/.test(url) ? url : null;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const map = cleanMap(f.map_embed_url);
    const invalid = !f.company_name.trim() ? 'Company name is required.'
      : f.phone.trim() && !PHONE_RE.test(f.phone.trim()) ? 'Enter a valid phone number.'
      : f.email.trim() && !EMAIL_RE.test(f.email.trim()) ? 'Enter a valid email address.'
      : map === null ? 'The map must be a Google Maps embed link (Google Maps → Share → Embed a map).' : null;
    if (invalid) { setFormError(invalid); return; }
    setBusy(true); setFormError(null);
    try {
      const base = { company_name: f.company_name.trim(), phone: f.phone.trim(), email: f.email.trim(), address: f.address.trim(), map_embed_url: map ?? '' };
      // Company details first, then each logo: upload → save path → remove the old file.
      await save(base);
      await persistWithImage({ bucket: 'logos', folder: 'main', draft: logoMain, currentPath: row?.logo_main_path ?? null, write: (p) => save({ ...base, logo_main_path: p }) });
      await persistWithImage({ bucket: 'logos', folder: 'secondary', draft: logoSecond, currentPath: row?.logo_secondary_path ?? null, write: (p) => save({ ...base, logo_secondary_path: p }) });
      setLogoMain(NO_IMAGE_CHANGE); setLogoSecond(NO_IMAGE_CHANGE);
      toast.success('Website settings saved', 'Changes are live on the website.');
    } catch (err) {
      setFormError(uploadErrorMessage(err) ?? apiError(err, 'Could not save the settings. Please try again.'));
    } finally { setBusy(false); }
  };

  if (loading) return <LoadingPanel />;
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Panel title="Company information" description="Shown in the header, footer, contact page, booking reference image and search-engine data.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name" required><input className="input" value={f.company_name} maxLength={120} onChange={(e) => set('company_name', e.target.value)} /></Field>
          <Field label="Phone" hint="Used by every Call button."><input className="input" type="tel" value={f.phone} maxLength={20} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Email"><input className="input" type="email" value={f.email} maxLength={160} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Address"><input className="input" value={f.address} maxLength={400} onChange={(e) => set('address', e.target.value)} /></Field>
          <Field label="Google Maps embed" className="sm:col-span-2" hint="Google Maps → Share → Embed a map. Paste the link or the whole <iframe> code.">
            <textarea className="input" rows={3} value={f.map_embed_url} onChange={(e) => set('map_embed_url', e.target.value)} placeholder="https://www.google.com/maps/embed?pb=…" />
          </Field>
        </div>
      </Panel>
      <Panel title="Logos" description="Stored in Supabase Storage. Square images work best for the main logo.">
        <div className="grid gap-4 sm:grid-cols-2">
          <ImageUploader bucket="logos" label="Main website logo" keepTransparency maxDimension={512} currentPath={row?.logo_main_path ?? null} draft={logoMain} onChange={setLogoMain} disabled={busy} />
          <ImageUploader bucket="logos" label="About section image" maxDimension={1600} currentPath={row?.logo_secondary_path ?? null} draft={logoSecond} onChange={setLogoSecond} disabled={busy} />
        </div>
      </Panel>
      <div className="max-w-3xl"><FormError>{formError}</FormError></div>
      <div><Button type="submit" loading={busy} loadingText="Saving…">Save settings</Button></div>
    </form>
  );
}

// ---------------- WhatsApp & social ----------------
const SOCIALS: { platform: SocialPlatform; label: string; placeholder: string }[] = [
  { platform: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/…' },
  { platform: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/…' },
  { platform: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/…' },
  { platform: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/…' },
];
export function SocialSettings() {
  const { rows, loading, error, reload } = useTable<SocialLink & Record<string, unknown>>('social_links', { orderBy: 'platform', ascending: true });
  const toast = useToast();
  const apiError = useApiError();
  const [f, setF] = useState<Record<SocialPlatform, string>>({ whatsapp: '', facebook: '', instagram: '', youtube: '', linkedin: '' });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (loading || loaded) return;
    setF((prev) => { const next = { ...prev }; rows.forEach((r) => { next[r.platform] = r.value; }); return next; });
    setLoaded(true);
  }, [rows, loading, loaded]);
  const preview = buildWhatsAppUrl(f.whatsapp);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (f.whatsapp.trim() && !preview) { setFormError('Enter a WhatsApp number with at least 10 digits, or a https://wa.me/… link.'); return; }
    const bad = SOCIALS.find((s) => f[s.platform].trim() && !/^https:\/\/\S+$/i.test(f[s.platform].trim()));
    if (bad) { setFormError(`${bad.label} must be a full link starting with https://`); return; }
    setBusy(true); setFormError(null);
    const payload = (Object.keys(f) as SocialPlatform[]).map((platform) => ({ platform, value: f[platform].trim() }));
    const { error: err } = await supabase.from('social_links').upsert(payload, { onConflict: 'platform' });
    setBusy(false);
    if (err) { setFormError(apiError(err, 'Could not save the links. Please try again.')); return; }
    toast.success('WhatsApp & social links saved', 'Every WhatsApp button on the site now uses this number.');
    void reload();
  };

  if (loading) return <LoadingPanel />;
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Panel title="WhatsApp" description="One number for the whole website: general enquiries, vehicle bookings, instant rides and offer enquiries all open a chat with it.">
        <Field label="WhatsApp number or link" hint={preview ? `Chats will open: ${preview}` : '10-digit Indian numbers get +91 added automatically.'}>
          <input className="input" value={f.whatsapp} maxLength={120} onChange={(e) => setF((p) => ({ ...p, whatsapp: e.target.value }))} placeholder="+91 98765 43210 or https://wa.me/919876543210" />
        </Field>
        {preview && <a href={preview} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm mt-3"><MessageCircle className="h-3.5 w-3.5" aria-hidden />Test this number</a>}
      </Panel>
      <Panel title="Social links" description="Shown in the website footer. Leave blank to hide.">
        <div className="grid gap-4 sm:grid-cols-2">
          {SOCIALS.map(({ platform, label, placeholder }) => (
            <Field key={platform} label={label}><input className="input" type="url" value={f[platform]} maxLength={300} placeholder={placeholder} onChange={(e) => setF((p) => ({ ...p, [platform]: e.target.value }))} /></Field>
          ))}
        </div>
      </Panel>
      <div className="max-w-3xl"><FormError>{formError}</FormError></div>
      <div><Button type="submit" loading={busy} loadingText="Saving…">Save links</Button></div>
    </form>
  );
}

// ---------------- SEO ----------------
export function SeoSettingsPage() {
  const { row, loading, error, reload, save } = useSingleton<SeoSettings>('seo_settings');
  const toast = useToast();
  const apiError = useApiError();
  const [f, setF] = useState({ title: '', description: '', keywords: '', og_title: '', og_description: '', canonical_url: '' });
  const [og, setOg] = useState<ImageDraft>(NO_IMAGE_CHANGE);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  useEffect(() => { if (row) setF({ title: row.title, description: row.description, keywords: row.keywords, og_title: row.og_title, og_description: row.og_description, canonical_url: row.canonical_url }); }, [row]);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const canonical = f.canonical_url.trim().replace(/\/+$/, '');
    if (canonical && !/^https:\/\/[^\s/]+/.test(canonical)) { setFormError('The site address must start with https://'); return; }
    setBusy(true); setFormError(null);
    const base = { title: f.title.trim(), description: f.description.trim(), keywords: f.keywords.trim(), og_title: f.og_title.trim(), og_description: f.og_description.trim(), canonical_url: canonical };
    try {
      await persistWithImage({ bucket: 'website-assets', folder: 'seo', draft: og, currentPath: row?.og_image_path ?? null, write: (p) => save({ ...base, og_image_path: p }) });
      setOg(NO_IMAGE_CHANGE);
      toast.success('SEO settings saved');
    } catch (err) { setFormError(uploadErrorMessage(err) ?? apiError(err, 'Could not save SEO settings. Please try again.')); }
    finally { setBusy(false); }
  };

  if (loading) return <LoadingPanel />;
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Panel title="Search engines" description="Use accurate descriptions of the service. Avoid claims that cannot be verified.">
        <div className="flex flex-col gap-4">
          <Field label="Site title" hint={`${f.title.length}/60 characters recommended`}><input className="input" value={f.title} maxLength={120} onChange={(e) => set('title', e.target.value)} /></Field>
          <Field label="Meta description" hint={`${f.description.length}/160 characters recommended`}><textarea className="input" rows={3} value={f.description} maxLength={320} onChange={(e) => set('description', e.target.value)} /></Field>
          <Field label="Keywords" hint="Comma separated."><input className="input" value={f.keywords} maxLength={400} onChange={(e) => set('keywords', e.target.value)} /></Field>
          <Field label="Site address (canonical)" hint="Your public domain, e.g. https://www.example.com. Leave blank to use the deployed address."><input className="input" type="url" value={f.canonical_url} onChange={(e) => set('canonical_url', e.target.value)} placeholder="https://" /></Field>
        </div>
        <div className="mt-5 rounded-md border border-line bg-surface p-4" aria-label="Search result preview">
          <p className="text-xs text-muted">Search preview</p>
          <p className="mt-1 truncate text-[17px] font-medium text-info">{f.title || 'Site title'}</p>
          <p className="line-clamp-2 text-[13px] text-muted">{f.description || 'Meta description'}</p>
        </div>
      </Panel>
      <Panel title="Sharing (Open Graph)" description="How links look when shared on WhatsApp, Facebook and other apps. Blank fields fall back to the title and description above.">
        <div className="flex flex-col gap-4">
          <Field label="Share title"><input className="input" value={f.og_title} maxLength={120} onChange={(e) => set('og_title', e.target.value)} /></Field>
          <Field label="Share description"><textarea className="input" rows={2} value={f.og_description} maxLength={320} onChange={(e) => set('og_description', e.target.value)} /></Field>
          <ImageUploader bucket="website-assets" label="Share image (1200 × 630 recommended)" currentPath={row?.og_image_path ?? null} draft={og} onChange={setOg} maxDimension={1200} disabled={busy} />
        </div>
      </Panel>
      <div className="max-w-3xl"><FormError>{formError}</FormError></div>
      <div><Button type="submit" loading={busy} loadingText="Saving…">Save SEO settings</Button></div>
    </form>
  );
}

// ---------------- Theme ----------------
export function ThemeSettings() {
  const { row, loading, error, reload, save } = useSingleton<SiteSettings>('site_settings');
  const toast = useToast();
  const apiError = useApiError();
  const [busy, setBusy] = useState<ThemeMode | null>(null);
  const choose = async (mode: ThemeMode) => {
    if (busy || row?.default_theme === mode) return;
    setBusy(mode);
    try { await save({ default_theme: mode }); toast.success(`Site default set to ${mode}`, 'New visitors see this unless they choose a theme themselves.'); }
    catch (err) { toast.error('Could not save theme', apiError(err, 'Please try again.')); }
    finally { setBusy(null); }
  };
  if (loading) return <LoadingPanel />;
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />;
  return (
    <Panel title="Default theme" description="Sets the site-wide default. Visitors can still switch with the sun/moon button, and their choice is remembered on their device.">
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Default theme">
        {([['light', 'Calm light', Sun], ['dark', 'Eye-comfort dark', Moon]] as const).map(([mode, label, Icon]) => {
          const active = row?.default_theme === mode;
          return (
            <button key={mode} type="button" role="radio" aria-checked={active} disabled={busy !== null} onClick={() => void choose(mode)}
              className={`flex min-h-[72px] items-center gap-3 rounded-lg border p-4 text-left ${active ? 'border-accent bg-accent-soft' : 'border-line bg-card hover:bg-surface'}`}>
              <Icon className="h-5 w-5 shrink-0 text-accent-text" aria-hidden />
              <span className="flex-1 text-sm font-semibold">{label}{busy === mode && <span className="block text-xs font-normal text-muted">Saving…</span>}</span>
              {active && <Check className="h-5 w-5 text-accent-text" aria-hidden />}
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

// ---------------- Pages ----------------
export function PagesAdmin() {
  const { rows, loading, error, reload, update } = useTable<PageContent & { id: string } & Record<string, unknown>>('page_content', { orderBy: 'name', ascending: true, idColumn: 'slug' });
  const toast = useToast();
  const apiError = useApiError();
  const [editing, setEditing] = useState<PageContent | null>(null);
  const [heading, setHeading] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const open = (p: PageContent) => { setEditing(p); setHeading(p.heading); setBody(p.body); setFormError(null); };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing || busy) return;
    setBusy(true); setFormError(null);
    try { await update(editing.slug, { heading: heading.trim(), body: body.trim() } as never); toast.success('Page content saved', 'Changes are live on the website.'); setEditing(null); }
    catch (err) { setFormError(apiError(err, 'Could not save page content. Please try again.')); }
    finally { setBusy(false); }
  };
  return (
    <div>
      <PageIntro text="Edit the headline and introduction text of each page. Text is shown exactly as typed — HTML is not interpreted." />
      {loading ? <LoadingPanel /> : error ? <ErrorState message={error} onRetry={() => void reload()} /> : (
        <ul className="grid max-w-3xl gap-3">
          {rows.map((p) => (
            <li key={p.slug} className="card flex items-center justify-between gap-4 p-4">
              <div className="min-w-0"><h2 className="text-base">{p.name}</h2><p className="truncate text-[13px] text-muted">{p.heading || p.description}</p></div>
              <Button variant="secondary" onClick={() => open(p)} icon={<Pencil className="h-4 w-4" aria-hidden />}>Edit</Button>
            </li>
          ))}
        </ul>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} busy={busy} title={`Edit "${editing?.name ?? ''}" content`} description={editing?.description}>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field label="Heading"><input className="input" value={heading} maxLength={160} onChange={(e) => setHeading(e.target.value)} /></Field>
          <Field label="Text" hint={`${body.length}/4000`}><textarea className="input" rows={6} value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)} /></Field>
          <FormError>{formError}</FormError>
          <div className="grid grid-cols-2 gap-2.5"><Button variant="secondary" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button><Button type="submit" loading={busy} loadingText="Saving…">Save</Button></div>
        </form>
      </Modal>
    </div>
  );
}

// ---------------- Admin management ----------------
const ROLE_HELP: Record<AdminRole, string> = {
  owner: 'Everything, including website settings and staff.',
  admin: 'Bookings, enquiries, messages and website content. No settings.',
  driver: 'Only the trips assigned to them, on their phone.',
};

export function AdminsPage() {
  const { role, userId, email } = useAuth();
  const toast = useToast();
  const apiError = useApiError();
  const [staff, setStaff] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<AdminRole>('admin');
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<AdminUser | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [edit, setEdit] = useState({ full_name: '', phone: '' });
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [pw, setPw] = useState({ next: '', confirm: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const isOwner = role === 'owner';

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('admin_list');
    if (err) setError(apiError(err, 'Could not load the staff list.'));
    else { setStaff((data ?? []) as AdminUser[]); setError(null); }
    setLoading(false);
  }, [apiError]);
  useEffect(() => { void load(); }, [load]);

  const grant = async (e: FormEvent) => {
    e.preventDefault();
    if (granting) return;
    if (!EMAIL_RE.test(newEmail.trim())) { setGrantError('Enter a valid email address.'); return; }
    setGranting(true); setGrantError(null);
    const { error: err } = await supabase.rpc('admin_grant', { p_email: newEmail.trim(), p_role: newRole });
    setGranting(false);
    if (err) { setGrantError(apiError(err, 'Could not add this person. Please try again.')); return; }
    toast.success(`${ROLE_LABEL[newRole]} added`, newEmail.trim()); setNewEmail(''); void load();
  };
  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing || editBusy) return;
    if (edit.phone.trim() && !PHONE_RE.test(edit.phone.trim())) { setEditError('Enter a valid phone number.'); return; }
    setEditBusy(true); setEditError(null);
    const { error: err } = await supabase.rpc('admin_update_staff', { p_user_id: editing.user_id, p_full_name: edit.full_name, p_phone: edit.phone });
    setEditBusy(false);
    if (err) { setEditError(apiError(err, 'Could not save. Please try again.')); return; }
    toast.success('Details saved'); setEditing(null); void load();
  };
  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (pwBusy) return;
    if (pw.next.length < 10) { setPwError('Use at least 10 characters.'); return; }
    if (pw.next !== pw.confirm) { setPwError('The two passwords do not match.'); return; }
    setPwBusy(true); setPwError(null);
    const { error: err } = await supabase.auth.updateUser({ password: pw.next });
    setPwBusy(false);
    if (err) { setPwError(/same|different/i.test(err.message) ? 'Choose a password you have not used before.' : /weak|short|least/i.test(err.message) ? 'That password is too weak. Use a longer one.' : apiError(err, 'Could not change the password. Sign in again and retry.')); return; }
    setPw({ next: '', confirm: '' }); toast.success('Password changed');
  };

  const groups: { role: AdminRole; title: string }[] = [
    { role: 'owner', title: 'Owners' }, { role: 'admin', title: 'Office staff' }, { role: 'driver', title: 'Drivers' },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Panel title="Staff & drivers" description="Each person signs in at /admin with their own email and password and sees only what their role allows. The database checks the role on every request.">
        {loading ? <Skeleton className="h-20 w-full" /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : (
          <div className="flex flex-col gap-5">
            {groups.map((g) => {
              const people = staff.filter((a) => a.role === g.role);
              return (
                <section key={g.role} aria-label={g.title}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <h3 className="text-sm font-semibold">{g.title} <span className="font-normal text-muted">({people.length})</span></h3>
                    <p className="hidden text-xs text-muted sm:block">{ROLE_HELP[g.role]}</p>
                  </div>
                  {people.length ? (
                    <ul className="divide-y divide-line rounded-lg border border-line">
                      {people.map((a) => (
                        <li key={a.user_id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">{a.full_name || a.email}{a.user_id === userId && <Badge tone="info">You</Badge>}</p>
                            <p className="truncate text-[13px] text-muted">{a.full_name ? `${a.email} · ` : ''}{a.phone || 'No phone'} · added {formatDateTime(a.created_at)}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {g.role === 'owner' && <ShieldCheck className="h-4 w-4 text-accent-text" aria-label="Owner" />}
                            {isOwner && (
                              <button type="button" onClick={() => { setEditError(null); setEdit({ full_name: a.full_name, phone: a.phone }); setEditing(a); }} aria-label={`Edit ${a.email}`}
                                className="grid h-11 w-11 place-items-center rounded-md border border-line hover:bg-sunken"><Pencil className="h-4 w-4" aria-hidden /></button>
                            )}
                            {isOwner && a.user_id !== userId && (
                              <button type="button" onClick={() => { setRevokeError(null); setRevoking(a); }} aria-label={`Remove access for ${a.email}`} className="grid h-11 w-11 place-items-center rounded-md border border-line text-danger hover:bg-danger-soft"><Trash2 className="h-4 w-4" aria-hidden /></button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="rounded-lg border border-dashed border-line px-3 py-3 text-[13px] text-muted">No {g.title.toLowerCase()} yet.</p>}
                </section>
              );
            })}
          </div>
        )}
      </Panel>
      {isOwner && (
        <Panel title="Add a person" description="1. Create their login in Supabase → Authentication → Users (tick Auto Confirm). 2. Enter the same email here and choose their role.">
          <form onSubmit={grant} noValidate className="grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
            <Field label="Email"><input className="input" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="person@example.com" /></Field>
            <Field label="Role"><select className="input" value={newRole} onChange={(e) => setNewRole(e.target.value as AdminRole)}>
              <option value="admin">Office staff</option><option value="driver">Driver</option><option value="owner">Owner</option>
            </select></Field>
            <Button type="submit" loading={granting} loadingText="Adding…" icon={<UserPlus className="h-4 w-4" aria-hidden />}>Add {ROLE_LABEL[newRole]}</Button>
            <p className="-mt-1 text-[13px] text-muted sm:col-span-3"><span className="font-semibold text-ink">{ROLE_LABEL[newRole]}:</span> {ROLE_HELP[newRole]}</p>
          </form>
          <div className="mt-3"><FormError>{grantError}</FormError></div>
        </Panel>
      )}
      <Panel title="Change your password" description={`Signed in as ${email ?? ''}.`}>
        <form onSubmit={changePassword} noValidate className="grid gap-4 sm:grid-cols-2">
          <Field label="New password" hint="At least 10 characters."><input className="input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} /></Field>
          <Field label="Confirm new password"><input className="input" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} /></Field>
          <div className="sm:col-span-2"><FormError>{pwError}</FormError></div>
          <div><Button type="submit" variant="secondary" loading={pwBusy} loadingText="Updating…">Update password</Button></div>
        </form>
      </Panel>
      <Modal open={editing !== null} onClose={() => setEditing(null)} busy={editBusy} title={`Edit ${editing ? ROLE_LABEL[editing.role].toLowerCase() : ''}`} description={editing?.email}>
        <form onSubmit={saveEdit} noValidate className="flex flex-col gap-4">
          <Field label="Name" hint="Shown to the office and, for drivers, to the customer."><input className="input" value={edit.full_name} maxLength={120} onChange={(e) => setEdit((p) => ({ ...p, full_name: e.target.value }))} /></Field>
          <Field label="Phone"><input className="input" type="tel" value={edit.phone} maxLength={20} onChange={(e) => setEdit((p) => ({ ...p, phone: e.target.value }))} /></Field>
          <FormError>{editError}</FormError>
          <div className="grid grid-cols-2 gap-2.5"><Button variant="secondary" onClick={() => setEditing(null)} disabled={editBusy}>Cancel</Button><Button type="submit" loading={editBusy} loadingText="Saving…">Save</Button></div>
        </form>
      </Modal>
      <ConfirmDialog open={revoking !== null} onCancel={() => setRevoking(null)} busy={revokeBusy} error={revokeError} confirmLabel="Remove access"
        title="Remove access?" message={`${revoking?.email ?? 'This account'} will no longer be able to open the dashboard${revoking?.role === 'driver' ? ' or see their trips' : ''}. Their login itself is not deleted.`}
        onConfirm={async () => {
          if (!revoking) return;
          setRevokeBusy(true); setRevokeError(null);
          const { error: err } = await supabase.rpc('admin_revoke', { p_user_id: revoking.user_id });
          setRevokeBusy(false);
          if (err) { setRevokeError(apiError(err, 'Could not remove access. Please try again.')); return; }
          toast.success('Access removed', revoking.email); setRevoking(null); void load();
        }} />
    </div>
  );
}
