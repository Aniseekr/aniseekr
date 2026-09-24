import { loadStampStopVisitedAtSync } from '@/libs/services/pilgrimage/visited-prefs';

/** Stamped role id → when it was stamped (null when the record has no usable time). */
export type StampCollectedAtMap = Readonly<Record<string, number | null>>;

/**
 * Synchronous snapshot for first-frame seeding (no await before paint): one read
 * of the visited blob. A stored time of 0 means "unknown", so it becomes null and
 * every surface shows "stamped" without inventing a date.
 */
export function loadStampCollectedAtSync(): StampCollectedAtMap {
  const out: Record<string, number | null> = {};
  for (const [roleId, at] of Object.entries(loadStampStopVisitedAtSync())) {
    out[roleId] = at > 0 ? at : null;
  }
  return out;
}

/** Same keys and values → same map; lets focus refreshes skip redundant renders. */
export function sameCollectedAt(a: StampCollectedAtMap, b: StampCollectedAtMap): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every((key) => key in b && a[key] === b[key]);
}

/**
 * Straight-line distance for a route leg: "< 10 m" for neighbours in the same
 * building, metres (to 10 m) below 1 km, else km with one decimal. Never a walking time.
 */
export function formatStraightLineDistance(km: number): string {
  const metres = km * 1000;
  if (metres < 10) return '< 10 m';
  if (km < 1) return `${Math.round(metres / 10) * 10} m`;
  return `${(Math.round(km * 10) / 10).toFixed(1)} km`;
}

/** Compact numeric month/day in local time (e.g. 9/24); no Intl needed on Hermes. */
export function formatStampDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
