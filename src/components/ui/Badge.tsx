import type { ReactNode } from 'react';
import { CheckCircle2, Clock, Flag, Info, PhoneCall, AlertCircle } from 'lucide-react';
import type { BookingStatus } from '@/types/db';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';
const TONE: Record<Tone, string> = {
  neutral: 'bg-sunken text-muted', info: 'bg-info-soft text-info', success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning', danger: 'bg-danger-soft text-danger', accent: 'bg-accent-soft text-accent-text',
};

export function Badge({ tone = 'neutral', icon, children }: { tone?: Tone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[tone]}`}>
      {icon}{children}
    </span>
  );
}

// Every status carries an icon and a readable label: colour is never the only signal.
const STATUS: Record<BookingStatus, { tone: Tone; Icon: typeof Clock }> = {
  Pending: { tone: 'warning', Icon: Clock },
  'Office Calling': { tone: 'info', Icon: PhoneCall },
  Confirmed: { tone: 'success', Icon: CheckCircle2 },
  'Trip Completed': { tone: 'neutral', Icon: Flag },
};
export function StatusBadge({ status, prefix }: { status: BookingStatus; prefix?: string }) {
  const { tone, Icon } = STATUS[status] ?? { tone: 'neutral' as Tone, Icon: Info };
  return <Badge tone={tone} icon={<Icon className="h-3.5 w-3.5" aria-hidden />}>{prefix}{status}</Badge>;
}
export function InfoBadge({ children }: { children: ReactNode }) {
  return <Badge tone="info" icon={<Info className="h-3.5 w-3.5" aria-hidden />}>{children}</Badge>;
}
export function ErrorBadge({ children }: { children: ReactNode }) {
  return <Badge tone="danger" icon={<AlertCircle className="h-3.5 w-3.5" aria-hidden />}>{children}</Badge>;
}
