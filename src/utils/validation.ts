import { todayIST } from './format';

// These mirror the checks in the create_booking() Postgres function. The database is the
// authority; validating here just gives people instant feedback.
export const PHONE_RE = /^\+?[0-9][0-9 -]{7,18}$/;
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function validateName(v: string): string | null {
  return v.trim().length >= 2 ? null : 'Please enter your full name.';
}
export function validatePhone(v: string): string | null {
  const t = v.trim();
  const digits = t.replace(/\D/g, '').length;
  return PHONE_RE.test(t) && digits >= 10 && digits <= 15 ? null : 'Please enter a valid phone number (at least 10 digits).';
}
export function validateEmail(v: string, required = false): string | null {
  const t = v.trim();
  if (!t) return required ? 'Please enter your email address.' : null;
  return EMAIL_RE.test(t) ? null : 'Please enter a valid email address.';
}

export interface JourneyFields {
  pickup: string; destination: string; date: string; time: string; members: string;
  roundTrip: boolean; returnDate: string; returnTime: string;
}
export type JourneyErrors = Partial<Record<'pickup' | 'destination' | 'date' | 'time' | 'members' | 'returnDate' | 'returnTime', string>>;

export function validateJourney(f: JourneyFields, today = todayIST()): JourneyErrors {
  const e: JourneyErrors = {};
  if (f.pickup.trim().length < 2) e.pickup = 'Please enter your pickup location.';
  if (f.destination.trim().length < 2) e.destination = 'Please enter your destination.';
  if (!f.date) e.date = 'Please choose your travel date.';
  else if (f.date < today) e.date = 'The travel date cannot be in the past.';
  if (!f.time) e.time = 'Please choose your travel time.';
  const n = Number(f.members);
  if (!f.members || !Number.isInteger(n) || n < 1 || n > 500) e.members = 'Enter the number of members (1 to 500).';
  if (f.roundTrip) {
    if (!f.returnDate) e.returnDate = 'Please choose your return date.';
    if (!f.returnTime) e.returnTime = 'Please choose your return time.';
    if (f.returnDate && f.returnTime && f.date && f.time && `${f.returnDate}T${f.returnTime}` <= `${f.date}T${f.time}`) {
      e.returnDate = 'The return must be after the pickup date and time.';
    }
  }
  return e;
}
