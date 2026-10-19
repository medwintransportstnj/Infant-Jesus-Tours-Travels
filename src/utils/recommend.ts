import type { Vehicle } from '@/types/db';

export interface Recommendation {
  /** Vehicles to offer, best fit first. */
  options: Vehicle[];
  /** Set when no single vehicle seats the whole group. */
  note: string | null;
}

/**
 * Smallest vehicles that seat the whole group come first. If the group is larger than
 * anything in the fleet, suggest several of the largest vehicle (same rule as the legacy site).
 */
export function recommendVehicles(vehicles: Vehicle[], members: number, limit = 4): Recommendation {
  const active = vehicles.filter((v) => v.is_active).sort((a, b) => a.capacity - b.capacity || a.name.localeCompare(b.name));
  if (!active.length) return { options: [], note: null };
  const n = Number.isFinite(members) && members > 0 ? Math.floor(members) : 0;
  if (!n) return { options: active.slice(0, limit), note: null };
  const fits = active.filter((v) => v.capacity >= n);
  if (fits.length) return { options: fits.slice(0, limit), note: null };
  const largest = active[active.length - 1];
  const count = Math.ceil(n / largest.capacity);
  return { options: [largest], note: `Group of ${n} — we'll arrange ${count} × ${largest.name}.` };
}
