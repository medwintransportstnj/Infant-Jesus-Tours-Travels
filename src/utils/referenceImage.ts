import type { BookingReceipt } from '@/types/db';
import { createdParts } from './format';

/**
 * Draws the booking reference card on a canvas and downloads it as a PNG.
 * Company name and phone come from site settings — nothing is hardcoded.
 */
export function downloadReferenceImage(receipt: BookingReceipt, company: { name: string; phone: string }): void {
  const w = 1080, h = 640;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  const c = createdParts(receipt.created_at);
  const font = (weight: number, size: number) => `${weight} ${size}px Inter, system-ui, -apple-system, "Segoe UI", sans-serif`;

  ctx.fillStyle = '#F6F2EE'; ctx.fillRect(0, 0, w, h);
  // card
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.roundRect(40, 40, w - 80, h - 80, 28); ctx.fill();
  ctx.strokeStyle = '#E2DBD4'; ctx.lineWidth = 2; ctx.stroke();
  // header band
  ctx.fillStyle = '#282422';
  ctx.beginPath(); ctx.roundRect(40, 40, w - 80, 120, [28, 28, 0, 0]); ctx.fill();
  ctx.fillStyle = '#FFFFFF'; ctx.font = font(700, 30); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(company.name.toUpperCase().slice(0, 44), 84, 100);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#2F6B4F'; ctx.font = font(700, 22);
  ctx.fillText(receipt.request_type === 'Vehicle Booking' ? 'BOOKING REFERENCE' : 'REQUEST REFERENCE', 84, 232);
  ctx.fillStyle = '#282422'; ctx.font = font(700, 104);
  ctx.fillText(receipt.reference, 80, 340);

  // status pill
  const status = `Status: ${receipt.status}`;
  ctx.font = font(600, 22);
  const pillW = ctx.measureText(status).width + 44;
  ctx.fillStyle = '#F8ECD8'; ctx.beginPath(); ctx.roundRect(w - 84 - pillW, 204, pillW, 44, 22); ctx.fill();
  ctx.fillStyle = '#8A5A20'; ctx.textAlign = 'center'; ctx.fillText(status, w - 84 - pillW / 2, 234);

  ctx.strokeStyle = '#E2DBD4'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(84, 388); ctx.lineTo(w - 84, 388); ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#706966'; ctx.font = font(500, 22); ctx.fillText('Requested on', 84, 440);
  ctx.fillStyle = '#282422'; ctx.font = font(600, 30); ctx.fillText(`${c.day}, ${c.date}`, 84, 482);
  ctx.fillStyle = '#A94747'; ctx.font = font(700, 30); ctx.fillText(c.time, 84, 524);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#706966'; ctx.font = font(500, 22);
  ctx.fillText('Show this reference when contacting our office', w - 84, 482);
  if (company.phone) { ctx.fillStyle = '#282422'; ctx.font = font(700, 30); ctx.fillText(company.phone, w - 84, 524); }

  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `${receipt.reference}-booking-reference.png`;
  document.body.appendChild(a); a.click(); a.remove();
}
