import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, FormError } from '@/components/ui/Field';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Toggle } from '@/components/ui/Toggle';
import { useToast } from '@/components/ui/Toast';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback';
import type { Bucket } from '@/lib/supabase';
import { NO_IMAGE_CHANGE, persistWithImage, removeObject, uploadErrorMessage, useApiError, useTable, type ImageDraft } from '../data';
import { ImageUploader } from './ImageUploader';

type Values = Record<string, string | number | boolean | null>;
export interface FieldDef {
  key: string; label: string; type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'toggle' | 'range';
  required?: boolean; options?: { value: string; label: string }[]; placeholder?: string; hint?: string;
  maxLength?: number; min?: number; max?: number; half?: boolean; /** select: store '' as NULL */ nullable?: boolean;
}
export interface ResourceConfig<T> {
  table: string; singular: string; intro: string; emptyTitle: string; emptyBody: string;
  orderBy?: string; ascending?: boolean; thenBy?: string;
  fields: FieldDef[]; defaults: Values;
  image?: { bucket: Bucket; folder: string; required?: boolean; label?: string; opacityKey?: string };
  validate?: (v: Values) => string | null;
  renderCard: (row: T, actions: ReactNode, helpers: { patch: (values: Partial<T>, message: string) => void; busy: boolean }) => ReactNode;
  gridClass?: string;
  filter?: (row: T) => boolean;
  toolbar?: (rows: T[]) => ReactNode;
  header?: ReactNode;
  saveLabel?: string;
}

export function PageIntro({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="max-w-2xl text-sm text-muted">{text}</p>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function RowActions({ onEdit, onDelete, label }: { onEdit?: () => void; onDelete?: () => void; label: string }) {
  const cls = 'grid h-11 w-11 place-items-center rounded-md border border-line bg-card hover:bg-sunken';
  return (
    <div className="flex shrink-0 gap-1.5">
      {onEdit && <button type="button" onClick={onEdit} aria-label={`Edit ${label}`} className={`${cls} text-ink`}><Pencil className="h-4 w-4" aria-hidden /></button>}
      {onDelete && <button type="button" onClick={onDelete} aria-label={`Delete ${label}`} className={`${cls} text-danger`}><Trash2 className="h-4 w-4" aria-hidden /></button>}
    </div>
  );
}

/** Config-driven list + create/edit dialog + delete confirmation, live through Realtime. */
export function ResourcePage<T extends { id: string; image_path?: string | null } & Record<string, unknown>>({ config }: { config: ResourceConfig<T> }) {
  const { rows, loading, error, reload, insert, update, remove } = useTable<T>(config.table, { orderBy: config.orderBy, ascending: config.ascending, thenBy: config.thenBy });
  const toast = useToast();
  const apiError = useApiError();
  const [editing, setEditing] = useState<T | 'new' | null>(null);
  const [values, setValues] = useState<Values>(config.defaults);
  const [image, setImage] = useState<ImageDraft>(NO_IMAGE_CHANGE);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<T | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [patching, setPatching] = useState(false);

  const visible = useMemo(() => (config.filter ? rows.filter(config.filter) : rows), [rows, config.filter]);
  const current = editing && editing !== 'new' ? editing : null;
  const nameOf = (row: T) => String(row.name ?? row.title ?? row.customer_name ?? row.caption ?? config.singular);

  const open = (row: T | 'new') => {
    const base: Values = { ...config.defaults };
    if (row !== 'new') config.fields.forEach((f) => { const v = row[f.key]; base[f.key] = v === null || v === undefined ? (f.type === 'toggle' ? false : '') : (v as string | number | boolean); });
    setValues(base); setImage(NO_IMAGE_CHANGE); setFieldErrors({}); setFormError(null); setEditing(row);
  };
  const setValue = (key: string, v: string | number | boolean) => setValues((prev) => ({ ...prev, [key]: v }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (saving || !editing) return;
    const errs: Record<string, string> = {};
    const payload: Record<string, unknown> = {};
    for (const f of config.fields) {
      const raw = values[f.key];
      if (f.type === 'toggle') { payload[f.key] = Boolean(raw); continue; }
      const text = typeof raw === 'string' ? raw.trim() : raw;
      if (f.required && (text === '' || text === null || text === undefined)) { errs[f.key] = `${f.label} is required.`; continue; }
      if (f.type === 'number' || f.type === 'range') {
        const n = Number(text);
        if (text === '' || Number.isNaN(n)) { if (f.required) errs[f.key] = `${f.label} must be a number.`; else payload[f.key] = null; continue; }
        if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) { errs[f.key] = `${f.label} must be between ${f.min} and ${f.max}.`; continue; }
        payload[f.key] = Math.round(n);
      } else if (f.type === 'select' && f.nullable) payload[f.key] = text === '' ? null : text;
      else payload[f.key] = text;
    }
    const hasImage = Boolean(image.prepared) || (!image.removed && Boolean(current?.image_path));
    if (config.image?.required && !hasImage) errs.__image = 'Please upload an image.';
    setFieldErrors(errs);
    if (Object.keys(errs).length) { setFormError('Please fix the highlighted fields.'); return; }
    const custom = config.validate?.({ ...values });
    if (custom) { setFormError(custom); return; }

    setSaving(true); setFormError(null);
    try {
      const write = async (imagePath: string | null) => {
        const full = config.image ? { ...payload, image_path: imagePath } : payload;
        if (current) await update(current.id, full as Partial<T>); else await insert(full as Partial<T>);
      };
      if (config.image) await persistWithImage({ bucket: config.image.bucket, folder: config.image.folder, draft: image, currentPath: current?.image_path ?? null, write });
      else await write(null);
      toast.success('Saved successfully', 'Your changes are now live on the website.');
      setEditing(null);
    } catch (err) {
      setFormError(uploadErrorMessage(err) ?? apiError(err, `Could not save this ${config.singular.toLowerCase()}. Please try again.`));
    } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true); setDeleteError(null);
    try {
      await remove(deleting.id);
      if (config.image && deleting.image_path) await removeObject(config.image.bucket, deleting.image_path);
      toast.success(`${config.singular} deleted`);
      setDeleting(null);
    } catch (err) {
      setDeleteError(apiError(err, 'Could not delete. Check the connection and try again.'));
    } finally { setDeleteBusy(false); }
  };

  const patch = (row: T) => (changes: Partial<T>, message: string) => {
    if (patching) return;
    setPatching(true);
    update(row.id, changes).then(() => toast.success(message)).catch((err) => toast.error('Could not update', apiError(err, 'Please try again.'))).finally(() => setPatching(false));
  };

  const addButton = <Button onClick={() => open('new')} icon={<Plus className="h-4 w-4" aria-hidden />}>Add {config.singular}</Button>;
  const opacity = config.image?.opacityKey ? Number(values[config.image.opacityKey]) || 100 : 100;

  return (
    <div>
      <PageIntro text={config.intro} action={addButton} />
      {config.header}
      {config.toolbar?.(rows)}
      {loading ? (
        <div className={config.gridClass ?? 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'} role="status" aria-label="Loading">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 w-full" />)}
        </div>
      ) : error ? <ErrorState message={error} onRetry={() => void reload()} /> : visible.length ? (
        <ul className={config.gridClass ?? 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'}>
          {visible.map((row) => (
            <li key={row.id}>
              {config.renderCard(row, <RowActions label={nameOf(row)} onEdit={() => open(row)} onDelete={() => { setDeleteError(null); setDeleting(row); }} />, { patch: patch(row), busy: patching })}
            </li>
          ))}
        </ul>
      ) : <EmptyState title={rows.length ? 'Nothing in this view' : config.emptyTitle} body={rows.length ? 'Try another filter.' : config.emptyBody} action={rows.length ? undefined : addButton} />}

      <Modal open={editing !== null} onClose={() => setEditing(null)} busy={saving} title={`${current ? 'Edit' : 'Add'} ${config.singular.toLowerCase()}`}
        description="Verified information only — this is published to the website.">
        <form onSubmit={save} noValidate className="flex flex-col gap-4">
          {config.image && (
            <div>
              <ImageUploader bucket={config.image.bucket} currentPath={current?.image_path ?? null} draft={image} onChange={setImage} label={config.image.label}
                allowRemove={!config.image.required} opacity={opacity} disabled={saving} />
              {fieldErrors.__image && <p role="alert" className="mt-1.5 text-[13px] text-danger">{fieldErrors.__image}</p>}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {config.fields.map((f) => {
              const v = values[f.key];
              const span = f.half ? '' : 'sm:col-span-2';
              if (f.type === 'toggle') return <div key={f.key} className={span}><Toggle checked={Boolean(v)} onChange={(c) => setValue(f.key, c)} label={f.label} description={f.hint} disabled={saving} /></div>;
              return (
                <Field key={f.key} label={f.type === 'range' ? `${f.label} — ${v}%` : f.label} required={f.required} error={fieldErrors[f.key]} hint={f.hint} className={span}>
                  {f.type === 'textarea' ? <textarea className="input" rows={3} value={String(v ?? '')} maxLength={f.maxLength} placeholder={f.placeholder} onChange={(e) => setValue(f.key, e.target.value)} />
                    : f.type === 'select' ? (
                      <select className="input" value={String(v ?? '')} onChange={(e) => setValue(f.key, e.target.value)}>
                        {(f.nullable || !f.required) && <option value="">{f.placeholder ?? 'None'}</option>}
                        {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : f.type === 'range' ? <input type="range" className="h-11 w-full accent-[rgb(var(--accent))]" min={f.min} max={f.max} value={Number(v)} onChange={(e) => setValue(f.key, Number(e.target.value))} />
                    : <input className="input" type={f.type} inputMode={f.type === 'number' ? 'numeric' : undefined} value={String(v ?? '')} min={f.min} max={f.max} maxLength={f.maxLength} placeholder={f.placeholder} onChange={(e) => setValue(f.key, e.target.value)} />}
                </Field>
              );
            })}
          </div>
          <FormError>{formError}</FormError>
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
            <Button type="submit" loading={saving} loadingText={image.prepared ? 'Uploading…' : 'Saving…'}>{config.saveLabel ?? 'Save'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={deleting !== null} onCancel={() => setDeleting(null)} onConfirm={() => void confirmDelete()} busy={deleteBusy} error={deleteError}
        title={`Delete this ${config.singular.toLowerCase()}?`} />
    </div>
  );
}
