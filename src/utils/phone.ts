// The one place phone numbers and emails are normalised. Normalisation is for building links and for
// comparison only — it is never a way to identify or sign in a person.

/** Digits with country code, e.g. "919842487017". A 10-digit number is treated as Indian (+91). */
export function toInternationalDigits(raw: string | null | undefined): string | null {
  let digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

export function buildTelUrl(raw: string): string | null {
  const digits = toInternationalDigits(raw);
  return digits ? `tel:+${digits}` : null;
}

/**
 * Native SMS composer with a prefilled message. "?&body=" is the form understood by both
 * iOS and Android; desktop browsers hand the link to whatever SMS-capable app is registered, if any.
 */
export function buildSmsUrl(raw: string, message: string): string | null {
  const digits = toInternationalDigits(raw);
  return digits ? `sms:+${digits}?&body=${encodeURIComponent(message)}` : null;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
