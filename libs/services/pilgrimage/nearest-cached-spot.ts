// Nearest cached-spot suggestion service (spec 3.2, data half). Scans cached
// anitabi detail payloads (see anitabi-service.ts DETAIL_CACHE_KEY_PREFIX)
// for a spot within `radiusMeters` of a capture location, so the standalone
// camera can offer "attach to this spot?". Rule 8: suggestions only ever
// come from real cached spots with valid geo — never fabricated.

import { CacheService } from '../cache-service';
import { locationService } from './location-service';
import type { AnitabiPoint } from './types';

// Mirror of anitabi-service.ts:32 (DETAIL_CACHE_KEY_PREFIX) — duplicated
// locally, rather than imported, so this lightweight scan doesn't pull in
// anitabi-service.ts's LocalDB/AnitabiClient dependency graph.
const DETAIL_CACHE_KEY_PREFIX = 'anitabi_points_v2_';
const DEFAULT_RADIUS_METERS = 150;

export interface NearestSpotSuggestion {
  animeId: number;
  spot: AnitabiPoint;
  distanceMeters: number;
}

function hasValidGeo(spot: AnitabiPoint): boolean {
  const [lat, lng] = spot.geo ?? [];
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0)
  );
}

/** Pure nearest-within-radius pick. `radiusMeters` in metres. Null when none qualify. */
export function pickNearestWithin(
  points: readonly { animeId: number; spot: AnitabiPoint }[],
  user: { latitude: number; longitude: number },
  radiusMeters: number
): NearestSpotSuggestion | null {
  let best: NearestSpotSuggestion | null = null;
  for (const { animeId, spot } of points) {
    if (!hasValidGeo(spot)) continue;
    const [lat, lng] = spot.geo;
    const meters = locationService.getDistanceKm(user, { latitude: lat, longitude: lng }) * 1000;
    if (!Number.isFinite(meters) || meters > radiusMeters) continue;
    if (!best || meters < best.distanceMeters) best = { animeId, spot, distanceMeters: meters };
  }
  return best;
}

/** Scan every cached anitabi detail (animes the user has opened) for the nearest spot. */
export async function findNearestCachedSpot(
  user: { latitude: number; longitude: number },
  radiusMeters: number = DEFAULT_RADIUS_METERS
): Promise<NearestSpotSuggestion | null> {
  let keys: string[];
  try {
    keys = await CacheService.allKeys();
  } catch {
    return null;
  }

  const detailKeys = keys.filter((k) => k.startsWith(DETAIL_CACHE_KEY_PREFIX));
  const flat: { animeId: number; spot: AnitabiPoint }[] = [];
  for (const key of detailKeys) {
    const animeId = Number(key.slice(DETAIL_CACHE_KEY_PREFIX.length));
    if (!Number.isFinite(animeId) || animeId <= 0) continue;
    const points = await CacheService.get<AnitabiPoint[]>(key);
    if (!Array.isArray(points)) continue;
    for (const spot of points) flat.push({ animeId, spot });
  }

  return pickNearestWithin(flat, user, radiusMeters);
}
