import { useSyncExternalStore } from 'react';

// A short two-note chime generated with the Web Audio API (no audio file to download).
// Browsers only allow sound after the person has interacted with the page, so the audio context is
// created on the first click/keypress. Whether sound is on is a per-device preference kept in the browser.

const KEY = 'ijt-sound';
const listeners = new Set<() => void>();
let ctx: AudioContext | null = null;
let primed = false;

function read(): boolean {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
let enabled = typeof window === 'undefined' ? true : read();

export function setSoundEnabled(value: boolean): void {
  enabled = value;
  try { localStorage.setItem(KEY, value ? 'on' : 'off'); } catch { /* preference lasts for this visit */ }
  listeners.forEach((l) => l());
  if (value) chime();
}

export function useSoundEnabled(): boolean {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => enabled, () => true);
}

function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try { ctx = new Ctor(); } catch { ctx = null; }
  return ctx;
}

/** Call once at app start: unlocks audio on the first interaction. */
export function primeAudio(): void {
  if (primed || typeof window === 'undefined') return;
  primed = true;
  const unlock = () => {
    const c = ensureContext();
    if (c?.state === 'suspended') void c.resume();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

export function chime(): void {
  if (!enabled || typeof window === 'undefined') return;
  const c = ensureContext();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  const start = c.currentTime + 0.01;
  [[784, 0], [1175, 0.13]].forEach(([freq, offset]) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.18, start + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.32);
    osc.connect(gain).connect(c.destination);
    osc.start(start + offset);
    osc.stop(start + offset + 0.35);
  });
}
