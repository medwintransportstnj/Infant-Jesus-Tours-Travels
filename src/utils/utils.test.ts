import { describe, expect, it } from 'vitest';
import { buildWhatsAppUrl, buildBookingMessage } from './whatsapp';
import { recommendVehicles } from './recommend';
import { validateJourney, validatePhone, validateEmail } from './validation';
import { daysLeft, formatDate, formatTime } from './format';
import { matchLocations } from './locations';
import { storageObjectName } from './image';
import { buildSmsUrl, normalizeEmail, toInternationalDigits } from './phone';
import type { BookingReceipt, Vehicle } from '@/types/db';

const vehicle = (name: string, capacity: number, is_active = true): Vehicle => ({
  id: name, name, capacity, is_active, category_id: null, has_ac: true, price_label: '', description: '',
  image_path: null, sort_order: 0, created_at: '', updated_at: '',
});

describe('buildWhatsAppUrl', () => {
  it('adds the India country code to a bare 10-digit number', () => {
    expect(buildWhatsAppUrl('9842487017')).toBe('https://wa.me/919842487017');
    expect(buildWhatsAppUrl('+91 98424 87017')).toBe('https://wa.me/919842487017');
    expect(buildWhatsAppUrl('098424 87017')).toBe('https://wa.me/919842487017');
  });
  it('encodes the message, including characters that would break a URL', () => {
    expect(buildWhatsAppUrl('9842487017', 'A & B\n#1?')).toBe('https://wa.me/919842487017?text=A%20%26%20B%0A%231%3F');
  });
  it('accepts wa.me links and appends text correctly', () => {
    expect(buildWhatsAppUrl('https://wa.me/919842487017', 'hi')).toBe('https://wa.me/919842487017?text=hi');
    expect(buildWhatsAppUrl('https://api.whatsapp.com/send?phone=919842487017', 'hi')).toBe('https://api.whatsapp.com/send?phone=919842487017&text=hi');
  });
  it('refuses anything that is not a number or a WhatsApp link', () => {
    expect(buildWhatsAppUrl('')).toBeNull();
    expect(buildWhatsAppUrl('javascript:alert(1)')).toBeNull();
    expect(buildWhatsAppUrl('https://evil.example/x')).toBeNull();
    expect(buildWhatsAppUrl('12345')).toBeNull();
  });
});

describe('recommendVehicles', () => {
  const fleet = [vehicle('Bus', 40), vehicle('Sedan', 4), vehicle('SUV', 7), vehicle('Old van', 12, false)];
  it('offers the smallest vehicles that fit, best fit first', () => {
    expect(recommendVehicles(fleet, 5).options.map((v) => v.name)).toEqual(['SUV', 'Bus']);
  });
  it('never offers inactive vehicles', () => {
    expect(recommendVehicles(fleet, 10).options.map((v) => v.name)).toEqual(['Bus']);
  });
  it('suggests multiples of the largest vehicle for oversized groups', () => {
    const r = recommendVehicles(fleet, 90);
    expect(r.options.map((v) => v.name)).toEqual(['Bus']);
    expect(r.note).toBe("Group of 90 — we'll arrange 3 × Bus.");
  });
  it('returns nothing when the fleet is empty', () => {
    expect(recommendVehicles([], 4)).toEqual({ options: [], note: null });
  });
});

describe('validation', () => {
  const base = { pickup: 'Thanjavur', destination: 'Chennai', date: '2026-10-10', time: '09:00', members: '4', roundTrip: false, returnDate: '', returnTime: '' };
  it('accepts a complete one-way journey', () => expect(validateJourney(base, '2026-10-03')).toEqual({}));
  it('rejects past dates and missing fields', () => {
    const e = validateJourney({ ...base, pickup: '', date: '2026-10-01', members: '0' }, '2026-10-03');
    expect(Object.keys(e).sort()).toEqual(['date', 'members', 'pickup']);
  });
  it('requires a return after the pickup for round trips', () => {
    expect(validateJourney({ ...base, roundTrip: true }, '2026-10-03')).toHaveProperty('returnDate');
    expect(validateJourney({ ...base, roundTrip: true, returnDate: '2026-10-10', returnTime: '08:00' }, '2026-10-03')).toHaveProperty('returnDate');
    expect(validateJourney({ ...base, roundTrip: true, returnDate: '2026-10-11', returnTime: '08:00' }, '2026-10-03')).toEqual({});
  });
  it('validates phone and email', () => {
    expect(validatePhone('+91 98424 87017')).toBeNull();
    expect(validatePhone('98424-87017')).toBeNull();
    expect(validatePhone('12345')).not.toBeNull();
    expect(validatePhone('phone me')).not.toBeNull();
    expect(validateEmail('')).toBeNull();
    expect(validateEmail('', true)).not.toBeNull();
    expect(validateEmail('a@b.co')).toBeNull();
    expect(validateEmail('a@b')).not.toBeNull();
  });
});

describe('format', () => {
  it('counts offer days inclusively and never goes negative', () => {
    expect(daysLeft('2026-10-03', '2026-10-03')).toBe(1);
    expect(daysLeft('2026-10-05', '2026-10-03')).toBe(3);
    expect(daysLeft('2026-10-02', '2026-10-03')).toBe(0);
    expect(daysLeft(null)).toBe(0);
  });
  it('formats dates and times without timezone drift', () => {
    expect(formatDate('2026-10-07')).toBe('07 Oct 2026');
    expect(formatTime('14:05:00')).toBe('2:05 PM');
    expect(formatTime('00:30')).toBe('12:30 AM');
    expect(formatDate(null)).toBe('—');
  });
});

describe('phone', () => {
  it('normalises Indian numbers to one international form', () => {
    for (const v of ['+91 98424 87017', '9842487017', '098424 87017', '91-98424-87017']) expect(toInternationalDigits(v)).toBe('919842487017');
    expect(toInternationalDigits('12345')).toBeNull();
    expect(toInternationalDigits('')).toBeNull();
  });
  it('builds an sms: link with an encoded body and normalises email', () => {
    expect(buildSmsUrl('+91 9487897160', 'Hi & hello')).toBe('sms:+919487897160?&body=Hi%20%26%20hello');
    expect(normalizeEmail('  Asha@Example.COM ')).toBe('asha@example.com');
  });
});

describe('misc', () => {
  it('suggests locations, prefix matches first', () => {
    expect(matchLocations('than')[0]).toBe('Thanjavur');
    expect(matchLocations('t')).toEqual([]);
  });
  it('generates storage names that satisfy the storage policy pattern', () => {
    const name = storageObjectName('../../Vehicles!', 'webp');
    expect(name).toMatch(/^[a-z0-9][a-z0-9/_-]{0,120}\.(webp|jpg|jpeg|png)$/);
    expect(name.startsWith('vehicles/')).toBe(true);
  });
  it('builds the WhatsApp booking message from the server receipt', () => {
    const receipt: BookingReceipt = {
      reference: 'IJT-0018', request_type: 'Vehicle Booking', status: 'Pending', customer_name: 'John', phone: '9876543210', email: null,
      pickup: 'Thanjavur', destination: 'Chennai', dropoff: null, travel_date: '2026-10-10', travel_time: '09:00:00', members: 4,
      round_trip: false, return_date: null, return_time: null, ac_preferred: true, flexible_time: false, notes: null,
      vehicle_name: 'Sedan', subject_title: null, created_at: '2026-10-03T05:00:00Z',
    };
    const msg = buildBookingMessage(receipt);
    expect(msg).toContain('Booking Reference: IJT-0018');
    expect(msg).toContain('Drop-off Location: Chennai');
    expect(msg).toContain('Pickup Time: 9:00 AM');
    expect(msg).toContain('Time: 10:30 AM');
  });
});
