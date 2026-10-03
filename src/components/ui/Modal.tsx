import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X } from 'lucide-react';
import { Button } from './Button';
import { FormError } from './Field';

interface ModalProps {
  open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg'; /** Prevent closing while a save is in flight. */ busy?: boolean;
}
const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Accessible dialog: centred on desktop, bottom sheet on phones. Traps focus, closes on Esc, restores focus. */
export function Modal({ open, onClose, title, description, children, footer, size = 'md', busy }: ModalProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const busyRef = useRef(busy); busyRef.current = busy;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = panel.current?.querySelector<HTMLElement>('[data-autofocus], input, select, textarea') ?? panel.current;
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyRef.current) { e.stopPropagation(); closeRef.current(); }
      if (e.key !== 'Tab' || !panel.current) return;
      const nodes = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (!nodes.length) return;
      const firstNode = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === firstNode) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); firstNode.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; previous?.focus?.(); };
  }, [open]);

  if (!open) return null;
  const width = size === 'sm' ? 'sm:max-w-md' : size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg';
  return createPortal(
    <div className="fixed inset-0 z-[100] flex animate-fade-in items-end justify-center bg-inverse/50 backdrop-blur-[2px] sm:items-center sm:p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={`flex max-h-[92dvh] w-full ${width} animate-rise-in flex-col rounded-t-xl border border-line bg-card shadow-lift outline-none sm:rounded-xl`}>
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden />
        <header className="flex items-start justify-between gap-4 px-5 pb-3 pt-4 sm:px-6 sm:pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close dialog"
            className="-mr-2 -mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink disabled:opacity-50">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">{children}</div>
        {footer && <footer className="flex flex-col-reverse gap-2.5 border-t border-line px-5 py-4 sm:flex-row sm:justify-end sm:px-6">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmProps {
  open: boolean; onCancel: () => void; onConfirm: () => void; title?: string; message?: string;
  confirmLabel?: string; busy?: boolean; error?: string | null;
}
/** Every destructive action in the admin goes through this dialog. */
export function ConfirmDialog({ open, onCancel, onConfirm, title = 'Delete this item?', message = 'This action cannot be undone. The item will no longer appear on the customer website.', confirmLabel = 'Delete', busy, error }: ConfirmProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm" busy={busy}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-danger-soft text-danger"><Trash2 className="h-5 w-5" aria-hidden /></span>
          <p className="pt-1.5 text-sm text-muted">{message}</p>
        </div>
        <FormError>{error}</FormError>
        <div className="grid grid-cols-2 gap-2.5">
          <Button variant="secondary" onClick={onCancel} disabled={busy} data-autofocus>Cancel</Button>
          <Button variant="primary" onClick={onConfirm} loading={busy} loadingText="Deleting…">{confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  );
}
