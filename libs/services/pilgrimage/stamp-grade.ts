// Whether a check-in counts as an on-site stamp (現地章) or a manual note (補記).
// On-site means a recent, reasonably accurate position fix puts the user at the
// spot. Everything here is pure so the rule is tested without a device.

export const ONSITE_RADIUS_METERS = 100;
/** Atlas `precision: 'area'` spots mark a neighbourhood, not a point. */
export const ONSITE_AREA_RADIUS_METERS = 300;
/**
 * The map's idle watcher only reports after ~50 m of movement, so a fix a few
 * minutes old still means "has not moved". Older than this, ask for a new one.
 */
export const ONSITE_MAX_FIX_AGE_MS = 5 * 60 * 1000;
export const ONSITE_MAX_ACCURACY_METERS = 100;

export interface StampFix {
  latitude: number;
  longitude: number;
  /** Metres; null when the OS reported none. */
  accuracy: number | null;
  /** Epoch ms of the fix. */
  at: number;
}

export interface StampSpotLike {
  id: string;
  lat: number | null;
  lon: number | null;
  precision?: string | null;
}

export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(1 - Math.min(1, h)));
}

function hasGeo(spot: StampSpotLike): spot is StampSpotLike & { lat: number; lon: number } {
  const { lat, lon } = spot;
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return !(lat === 0 && lon === 0);
}

/** A fix can prove presence only when it is recent and not too vague. */
export function isUsableFix(fix: StampFix | null | undefined, now: number): fix is StampFix {
  if (!fix) return false;
  if (!Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude)) return false;
  if (now - fix.at > ONSITE_MAX_FIX_AGE_MS) return false;
  return fix.accuracy === null || fix.accuracy <= ONSITE_MAX_ACCURACY_METERS;
}

/** Spots without coordinates can never be stamped on-site. */
export function isOnsite(spot: StampSpotLike, fix: StampFix | null | undefined, now: number): boolean {
  if (!hasGeo(spot) || !isUsableFix(fix, now)) return false;
  const radius = spot.precision === 'area' ? ONSITE_AREA_RADIUS_METERS : ONSITE_RADIUS_METERS;
  return distanceMeters(fix, { latitude: spot.lat, longitude: spot.lon }) <= radius;
}

/** Every spot the fix proves the user is at — one place often holds several scenes. */
export function spotsOnsite<T extends StampSpotLike>(
  spots: readonly T[],
  fix: StampFix | null | undefined,
  now: number
): T[] {
  if (!isUsableFix(fix, now)) return [];
  return spots.filter((spot) => isOnsite(spot, fix, now));
}
