// Foreground proximity check-in (spec 3.5): when the user's live location on
// the detail map is within `radiusMeters` of a NOT-yet-checked-in point, the
// screen offers a one-tap check-in banner. No background geofence — this is
// only ever evaluated against the already-throttled foreground location tick
// the detail screen holds (Rule 9), never a live-frequency sensor path.

import { pickNearestWithin, type NearestSpotSuggestion } from './nearest-cached-spot';
import type { PilgrimageSpot } from './types';
import type { VisitedMap } from './visited-prefs';

/** Nearest spot not already checked in, within radiusMeters. */
export function nearestUnvisitedWithin(
  points: readonly PilgrimageSpot[],
  visited: VisitedMap,
  user: { latitude: number; longitude: number },
  radiusMeters: number
): NearestSpotSuggestion | null {
  const flat = points
    .filter((spot) => visited[spot.id] !== true)
    .map((spot) => ({ workKey: spot.workKey, spot }));
  return pickNearestWithin(flat, user, radiusMeters);
}
