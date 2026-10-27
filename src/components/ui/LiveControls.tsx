import { BellOff, BellRing, Smartphone, Volume2, VolumeX } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useLiveState } from '@/lib/live';
import { setSoundEnabled, useSoundEnabled } from '@/lib/chime';
import { usePushNotifications } from '@/lib/push';

/** "Live" / "Reconnecting…" dot for the header. Reports the state of every live channel in this tab. */
export function LiveIndicator({ inverse = false, className = '' }: { inverse?: boolean; className?: string }) {
  const state = useLiveState();
  if (state === 'idle') return null;
  const label = state === 'live' ? 'Live' : state === 'connecting' ? 'Connecting…' : 'Offline';
  const dot = state === 'live' ? 'bg-success' : state === 'connecting' ? 'bg-warning' : 'bg-danger';
  const title = state === 'live' ? 'Updates arrive instantly.'
    : state === 'connecting' ? 'Connecting to live updates…'
    : 'Live updates are not reaching this page. New items will appear when you refresh or the connection returns.';
  return (
    <span role="status" title={title} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${inverse ? 'bg-white/10 text-white/85' : 'bg-sunken text-muted'} ${className}`}>
      <span aria-hidden className={`relative h-2 w-2 rounded-full ${dot}`}>
        {state === 'live' && <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" />}
      </span>
      {label}<span className="sr-only">: {title}</span>
    </span>
  );
}

export function SoundToggle({ className = '' }: { className?: string }) {
  const on = useSoundEnabled();
  return (
    <button type="button" onClick={() => setSoundEnabled(!on)} aria-pressed={on}
      className={`inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-ink hover:bg-sunken ${className}`}>
      {on ? <Volume2 className="h-4 w-4 text-accent-text" aria-hidden /> : <VolumeX className="h-4 w-4 text-muted" aria-hidden />}
      Sound {on ? 'on' : 'off'}
    </button>
  );
}

/** Turn notifications on this device on or off, with an honest explanation when it is not possible. */
export function PushToggle({ client, userId, className = '' }: { client: SupabaseClient; userId: string | null; className?: string }) {
  const { state, busy, error, enable, disable } = usePushNotifications(client, userId);
  if (state === 'checking') return null;
  const note: Record<string, string> = {
    unsupported: 'This browser cannot show notifications when the site is closed.',
    'ios-install': 'On iPhone or iPad: tap Share → Add to Home Screen, open the site from there, then turn this on.',
    'not-configured': 'Phone notifications are not set up on this website yet.',
    blocked: 'Notifications are blocked for this site. Allow them in your browser settings, then try again.',
  };
  if (state in note) {
    return (
      <p className={`flex items-start gap-2 text-[13px] text-muted ${className}`}>
        <BellOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{note[state]}
      </p>
    );
  }
  const on = state === 'on';
  return (
    <div className={className}>
      <button type="button" onClick={() => void (on ? disable() : enable())} disabled={busy} aria-pressed={on}
        className={`inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium hover:bg-sunken disabled:opacity-60 ${on ? 'text-ink' : 'text-accent-text'}`}>
        {on ? <BellRing className="h-4 w-4 text-success" aria-hidden /> : <Smartphone className="h-4 w-4" aria-hidden />}
        {busy ? 'Working…' : on ? 'Notifications on this device: on' : 'Notify me on this device'}
      </button>
      {!on && !error && <p className="px-3 text-xs text-muted">Get alerts even when this site is closed.</p>}
      {error && <p role="alert" className="px-3 text-xs text-danger">{error}</p>}
    </div>
  );
}
