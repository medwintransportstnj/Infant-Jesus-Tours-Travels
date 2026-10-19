import type { WhatsAppLaunch } from '@/types/db';

/**
 * Popup-safe WhatsApp hand-off.
 *
 * Browsers only allow a new tab during a user gesture, and saving a booking is asynchronous. So:
 *   1. reserve() is called synchronously inside the submit click — it opens a blank tab while the gesture is live;
 *   2. the booking is saved;
 *   3. open(url) points that tab at wa.me with the message prefilled (the customer still presses Send);
 *      or cancel() closes it if the save failed.
 * If the browser refused the tab, open() reports 'blocked' and the page shows a manual button instead.
 * Nothing here can fail a booking.
 */
export interface ReservedWindow { open: (url: string | null) => WhatsAppLaunch; cancel: () => void }

export function reserveWhatsAppWindow(enabled: boolean): ReservedWindow {
  let win: Window | null = null;
  if (enabled && typeof window !== 'undefined') {
    try {
      win = window.open('', '_blank');
      if (win) {
        win.opener = null;
        win.document.title = 'Opening WhatsApp…';
        win.document.body.style.cssText = 'font:16px system-ui,sans-serif;padding:24px;color:#282422;background:#F6F2EE';
        win.document.body.textContent = 'Saving your request, then opening WhatsApp…';
      }
    } catch { win = null; }
  }
  return {
    open(url) {
      if (!url) { try { win?.close(); } catch { /* already closed */ } return 'unavailable'; }
      if (!win || win.closed) return 'blocked';
      try { win.location.replace(url); return 'opened'; } catch { return 'blocked'; }
    },
    cancel() { try { win?.close(); } catch { /* already closed */ } },
  };
}
