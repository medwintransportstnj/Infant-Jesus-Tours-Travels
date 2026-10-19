import type { BookingReceipt } from '@/types/db';
import { createdParts, formatDate, formatTime } from './format';
import { toInternationalDigits } from './phone';

/**
 * Every business WhatsApp link on the site is built here from the single number stored in
 * Admin → WhatsApp & Social. Accepts a bare number or a wa.me link. Returns null (never a broken
 * link) when the value is missing or invalid.
 */
export function buildWhatsAppUrl(raw: string | null | undefined, message?: string): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  const text = message ? `text=${encodeURIComponent(message)}` : '';
  if (/^https:\/\/(wa\.me|api\.whatsapp\.com)\//i.test(value)) {
    if (!text) return value;
    return `${value}${value.includes('?') ? '&' : '?'}${text}`;
  }
  const digits = toInternationalDigits(value);
  return digits ? `https://wa.me/${digits}${text ? `?${text}` : ''}` : null;
}

export const GENERAL_ENQUIRY_MESSAGE = 'Hi, I need a vehicle.';

function stamp(b: BookingReceipt): string[] {
  const c = createdParts(b.created_at);
  return [`Booking Reference: ${b.reference}`, `Date: ${c.date}`, `Time: ${c.time}`, `Day: ${c.day}`];
}

export function buildBookingMessage(b: BookingReceipt): string {
  const lines = [`Full Name: ${b.customer_name}`, `Phone Number: ${b.phone}`];
  if (b.email) lines.push(`Email: ${b.email}`);
  lines.push(
    `Pickup Location: ${b.pickup ?? ''}`,
    `Destination: ${b.destination ?? ''}`,
    `Drop-off Location: ${b.dropoff || b.destination || ''}`,
    `Pickup Date: ${formatDate(b.travel_date)}`,
    `Pickup Time: ${formatTime(b.travel_time)}`,
    `Number of Members: ${b.members ?? ''}`,
    `Round Trip: ${b.round_trip ? 'Yes' : 'No'}`,
  );
  if (b.round_trip) lines.push(`Return: ${formatDate(b.return_date)} ${formatTime(b.return_time)}`);
  if (b.vehicle_name) lines.push(`Vehicle: ${b.vehicle_name}`);
  if (b.ac_preferred !== null) lines.push(`AC Preferred: ${b.ac_preferred ? 'Yes' : 'No'}`);
  if (b.flexible_time) lines.push('Departure Time: Flexible');
  if (b.notes) lines.push(`Special Requirements: ${b.notes}`);
  return [...lines, ...stamp(b)].join('\n');
}

export function buildInstantRideMessage(b: BookingReceipt): string {
  const lines = [`Full Name: ${b.customer_name}`, `Phone Number: ${b.phone}`, 'I want to book an Instant Ride'];
  if (b.pickup) lines.push(`Pickup Location: ${b.pickup}`);
  if (b.destination) lines.push(`Destination: ${b.destination}`);
  if (b.notes) lines.push(`Note: ${b.notes}`);
  return [...lines, ...stamp(b)].join('\n');
}

export function buildEnquiryMessage(b: BookingReceipt): string {
  const lines = [`Full Name: ${b.customer_name}`, `Phone Number: ${b.phone}`];
  if (b.email) lines.push(`Email: ${b.email}`);
  lines.push(`${b.request_type === 'Package Enquiry' ? 'Package' : 'Offer'} Enquiry About: ${b.subject_title ?? ''}`);
  return [...lines, ...stamp(b)].join('\n');
}

export function messageForReceipt(b: BookingReceipt): string {
  if (b.request_type === 'Vehicle Booking') return buildBookingMessage(b);
  if (b.request_type === 'Instant Ride') return buildInstantRideMessage(b);
  return buildEnquiryMessage(b);
}
