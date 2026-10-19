import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ImageIcon, Loader2, Trash2, Upload } from 'lucide-react';
import { publicImageUrl, type Bucket } from '@/lib/supabase';
import { ImageValidationError, prepareImage } from '@/utils/image';
import type { ImageDraft } from '../data';

interface Props {
  bucket: Bucket; currentPath: string | null; draft: ImageDraft; onChange: (d: ImageDraft) => void;
  label?: string; keepTransparency?: boolean; maxDimension?: number; allowRemove?: boolean; opacity?: number; disabled?: boolean;
}

/** Pick → validate → compress → preview. Nothing is uploaded until the form is saved. */
export function ImageUploader({ bucket, currentPath, draft, onChange, label = 'Image', keepTransparency, maxDimension, allowRemove = true, opacity = 100, disabled }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = draft.prepared?.previewUrl ?? (draft.removed ? null : publicImageUrl(bucket, currentPath));

  // Free the preview blob URL when it is replaced or the form closes.
  const lastUrl = useRef<string | null>(null);
  useEffect(() => {
    const url = draft.prepared?.previewUrl ?? null;
    if (lastUrl.current && lastUrl.current !== url) URL.revokeObjectURL(lastUrl.current);
    lastUrl.current = url;
  }, [draft.prepared]);
  useEffect(() => () => { if (lastUrl.current) URL.revokeObjectURL(lastUrl.current); }, []);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setProcessing(true); setError(null);
    try {
      const prepared = await prepareImage(file, { keepTransparency, maxDimension, maxBytes: bucket === 'logos' ? 1024 * 1024 : undefined });
      onChange({ prepared, removed: false });
    } catch (err) {
      if (!(err instanceof ImageValidationError)) console.error('[ijt] image processing failed', err);
      setError(err instanceof ImageValidationError ? err.message : 'That image could not be processed. Please try a different file.');
    } finally {
      setProcessing(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div>
      <span className="label">{label}</span>
      <div className="rounded-md border border-dashed border-line bg-surface p-3">
        <div className="flex items-center gap-3">
          <div className="relative grid h-20 w-28 shrink-0 place-items-center overflow-hidden rounded-md bg-sunken text-muted">
            {preview ? <img src={preview} alt="Selected image preview" className="h-full w-full object-cover" style={{ opacity: opacity / 100 }} /> : <ImageIcon className="h-5 w-5" aria-hidden />}
            {processing && <span className="absolute inset-0 grid place-items-center bg-card/70"><Loader2 className="h-5 w-5 animate-spin" aria-hidden /></span>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={() => input.current?.click()} disabled={disabled || processing}>
                <Upload className="h-3.5 w-3.5" aria-hidden />{preview ? 'Replace' : 'Upload'}
              </button>
              {allowRemove && preview && (
                <button type="button" className="btn-ghost btn-sm" onClick={() => onChange({ prepared: null, removed: true })} disabled={disabled || processing}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />Remove
                </button>
              )}
            </div>
            <p className="mt-1.5 text-xs text-muted" aria-live="polite">
              {processing ? 'Preparing image…' : draft.prepared ? `Ready to upload · ${draft.prepared.width}×${draft.prepared.height} · ${Math.max(1, Math.round(draft.prepared.blob.size / 1024))} KB` : 'JPG, PNG or WebP. Compressed automatically.'}
            </p>
          </div>
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-label={`${label} file`}
          onChange={(e) => void pick(e.target.files?.[0])} />
      </div>
      {error && <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-[13px] text-danger"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{error}</p>}
    </div>
  );
}
