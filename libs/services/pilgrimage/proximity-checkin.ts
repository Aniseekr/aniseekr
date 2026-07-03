// Foreground proximity check-in (spec 3.5): when the user's live location on
// the detail map is within `radiusMeters` of a NOT-yet-checked-in point, the
// screen offers a one-tap check-in banner. No background geofence — this is
// only ever evaluated against the already-throttled foreground location tick
// the detail screen holds (Rule 9), never a live-frequency sensor path.

import { pickNearestWithin, type NearestSpotSuggestion } from './nearest-cached-spot';
import type { AnitabiPoint } from './types';
import type { VisitedMap } from './visited-prefs';

/** Nearest point NOT already checked in, within radiusMeters. animeId is irrelevant here (0). */
export function nearestUnvisitedWithin(
  points: readonly AnitabiPoint[],
  visited: VisitedMap,
  user: { latitude: number; longitude: number },
  radiusMeters: number
): NearestSpotSuggestion | null {
  const flat = points.filter((p) => visited[p.id] !== true).map((spot) => ({ animeId: 0, spot }));
  return pickNearestWithin(flat, user, radiusMeters);
}
