import type { ReactNode } from 'react';
import { ImageIcon, RefreshCw, SearchX, WifiOff } from 'lucide-react';
import { Button } from './Button';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

/** Card-shaped placeholder that keeps the final layout dimensions while content loads. */
export function CardSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div className="card overflow-hidden" aria-hidden>
      <Skeleton className="aspect-[16/10] w-full rounded-none" />
      <div className="space-y-3 p-4">
        <Skeleton className="h-5 w-3/5" />
        {Array.from({ length: lines }).map((_, i) => <Skeleton key={i} className={`h-3.5 ${i % 2 ? 'w-2/5' : 'w-4/5'}`} />)}
        <Skeleton className="h-11 w-full" />
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 3, className = 'grid gap-5 sm:grid-cols-2 lg:grid-cols-3' }: { count?: number; className?: string }) {
  return (
    <div className={className} role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => <CardSkeleton key={i} />)}
    </div>
  );
}

interface EmptyProps { icon?: ReactNode; title: string; body?: string; action?: ReactNode; className?: string }
export function EmptyState({ icon, title, body, action, className = '' }: EmptyProps) {
  return (
    <div className={`card flex flex-col items-center px-6 py-12 text-center ${className}`}>
      <span className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-accent-text">
        {icon ?? <SearchX className="h-6 w-6" aria-hidden />}
      </span>
      <h3 className="text-lg">{title}</h3>
      {body && <p className="mt-1.5 max-w-md text-sm text-muted">{body}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2.5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="card flex flex-col items-center border-danger/30 px-6 py-10 text-center">
      <span className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-danger-soft text-danger"><WifiOff className="h-6 w-6" aria-hidden /></span>
      <h3 className="text-lg">Something went wrong</h3>
      <p className="mt-1.5 max-w-md text-sm text-muted">{message}</p>
      {onRetry && <Button variant="secondary" className="mt-5" onClick={onRetry} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>Try again</Button>}
    </div>
  );
}

interface ImageBoxProps { src: string | null; alt: string; ratio?: string; className?: string; placeholder?: string; opacity?: number; eager?: boolean; rounded?: string }
/** Fixed-ratio image frame: reserves space (no layout shift), lazy-loads, and shows a neutral placeholder when there is no image. */
export function ImageBox({ src, alt, ratio = 'aspect-[16/10]', className = '', placeholder, opacity = 100, eager, rounded = '' }: ImageBoxProps) {
  return (
    <div className={`relative overflow-hidden bg-sunken ${ratio} ${rounded} ${className}`}>
      {src ? (
        <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" fetchPriority={eager ? 'high' : undefined}
          className="absolute inset-0 h-full w-full object-cover" style={opacity < 100 ? { opacity: opacity / 100 } : undefined} />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center text-muted/70">
          <ImageIcon className="h-6 w-6" aria-hidden />
          {placeholder && <span className="text-[11px] font-medium uppercase tracking-wide">{placeholder}</span>}
        </div>
      )}
    </div>
  );
}
