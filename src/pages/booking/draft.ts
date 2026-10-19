import type { BookingReceipt } from '@/types/db';

export interface BookingDraft {
  pickup: string; destination: string; dropoff: string; date: string; time: string; members: string;
  roundTrip: boolean; returnDate: string; returnTime: string;
  name: string; phone: string; email: string; notes: string; acPreferred: boolean; flexibleTime: boolean;
  vehicleId: string | null;
}
export const EMPTY_DRAFT: BookingDraft = {
  pickup: '', destination: '', dropoff: '', date: '', time: '', members: '', roundTrip: false, returnDate: '', returnTime: '',
  name: '', phone: '', email: '', notes: '', acPreferred: true, flexibleTime: false, vehicleId: null,
};

// The confirmation the customer just received is kept for this browser tab only, so a refresh of the
// confirmation page does not lose their reference. It is the customer's own receipt, cleared when the tab closes.
const RECEIPT_KEY = 'ijt-last-receipt';
export function rememberReceipt(r: BookingReceipt): void {
  try { sessionStorage.setItem(RECEIPT_KEY, JSON.stringify(r)); } catch { /* storage unavailable */ }
}
export function recallReceipt(): BookingReceipt | null {
  try {
    const raw = sessionStorage.getItem(RECEIPT_KEY);
    const parsed = raw ? (JSON.parse(raw) as BookingReceipt) : null;
    return parsed && typeof parsed.reference === 'string' ? parsed : null;
  } catch { return null; }
}
