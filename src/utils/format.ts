const IST = 'Asia/Kolkata';

/** yyyy-mm-dd for "today" in India, regardless of the visitor's device timezone. */
export function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** "2026-10-07" -> "07 Oct 2026" (a calendar date, so no timezone conversion). */
export function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "14:30:00" -> "2:30 PM" */
export function formatTime(time: string | null | undefined): string {
  if (!time) return '—';
  const [h, min] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(min)) return '—';
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(min).padStart(2, '0')} ${suffix}`;
}

/** Timestamp -> parts shown on receipts, always in India time. */
export function createdParts(iso: string): { day: string; date: string; time: string } {
  const d = new Date(iso);
  return {
    day: new Intl.DateTimeFormat('en-IN', { weekday: 'long', timeZone: IST }).format(d),
    date: new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: IST }).format(d),
    time: new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: IST }).format(d).toUpperCase(),
  };
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const p = createdParts(iso);
  return `${p.date}, ${p.time}`;
}

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return formatDateTime(iso);
}

/** Whole days until an offer's expiry date (inclusive), measured in India time. 0 = expired. */
export function daysLeft(expiresOn: string | null | undefined, today = todayIST()): number {
  if (!expiresOn) return 0;
  const diff = (Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000;
  return diff < 0 ? 0 : Math.floor(diff) + 1;
}
