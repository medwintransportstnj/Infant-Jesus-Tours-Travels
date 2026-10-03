import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface FieldProps {
  label: string; required?: boolean; error?: string | null; hint?: string; className?: string;
  /** A single form control. It receives id / aria-invalid / aria-describedby automatically. */
  children: ReactElement;
}

/** Label + control + error/hint, wired for screen readers. Placeholders are never the only label. */
export function Field({ label, required, error, hint, className = '', children }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id: (children.props as { id?: string }).id ?? id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
        'aria-required': required || undefined,
      })
    : children;
  return (
    <div className={className}>
      <label htmlFor={(children.props as { id?: string }).id ?? id} className="label">
        {label}{required && <span className="text-accent-text" aria-hidden> *</span>}
      </label>
      {control}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 flex items-start gap-1.5 text-[13px] text-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{error}
        </p>
      ) : hint ? <p id={`${id}-hint`} className="mt-1.5 text-[13px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-soft px-3.5 py-3 text-sm text-danger">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{children}</span>
    </div>
  );
}
