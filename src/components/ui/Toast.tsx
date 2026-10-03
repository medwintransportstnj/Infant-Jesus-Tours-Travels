import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

type Tone = 'success' | 'error' | 'info';
interface ToastItem { id: number; tone: Tone; title: string; body?: string }
interface ToastCtx { success: (title: string, body?: string) => void; error: (title: string, body?: string) => void; info: (title: string, body?: string) => void }

const ToastContext = createContext<ToastCtx | null>(null);
const TONE = {
  success: { Icon: CheckCircle2, cls: 'border-success/40 bg-success-soft text-success' },
  error: { Icon: AlertCircle, cls: 'border-danger/40 bg-danger-soft text-danger' },
  info: { Icon: Info, cls: 'border-info/30 bg-info-soft text-info' },
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback((tone: Tone, title: string, body?: string) => {
    const id = nextId.current++;
    setItems((list) => [...list.slice(-2), { id, tone, title, body }]);
    window.setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4200);
  }, [dismiss]);
  const api = useMemo<ToastCtx>(() => ({
    success: (t, b) => push('success', t, b), error: (t, b) => push('error', t, b), info: (t, b) => push('info', t, b),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[200] flex flex-col items-center gap-2 px-3" aria-live="polite" aria-atomic="false">
        {items.map((t) => {
          const { Icon, cls } = TONE[t.tone];
          return (
            <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto flex w-full max-w-md animate-rise-in items-start gap-3 rounded-lg border p-3.5 shadow-lift ${cls}`}>
              <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t.title}</p>
                {t.body && <p className="mt-0.5 text-[13px] text-ink/80">{t.body}</p>}
              </div>
              <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss notification"
                className="-m-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink/60 hover:bg-ink/5 hover:text-ink">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
