import { locationService } from './location-service';
import { atlasClient } from './atlas/atlas-client';
import type { PilgrimageSpot } from './types';

const DEFAULT_RADIUS_METERS = 150;

export interface NearestSpotSuggestion {
  workKey: string;
  spot: PilgrimageSpot;
  distanceMeters: number;
}

export function pickNearestWithin(
  spots: readonly { workKey: string; spot: PilgrimageSpot }[],
  user: { latitude: number; longitude: number },
  radiusMeters: number
): NearestSpotSuggestion | null {
  let best: NearestSpotSuggestion | null = null;
  for (const { workKey, spot } of spots) {
    if (spot.lat === null || spot.lon === null) continue;
    if (!Number.isFinite(spot.lat) || !Number.isFinite(spot.lon)) continue;
    if (spot.lat === 0 && spot.lon === 0) continue;
    const meters =
      locationService.getDistanceKm(user, { latitude: spot.lat, longitude: spot.lon }) * 1000;
    if (!Number.isFinite(meters) || meters > radiusMeters) continue;
    if (!best || meters < best.distanceMeters) best = { workKey, spot, distanceMeters: meters };
  }
  return best;
}

/** Find the nearest Atlas spot within the requested radius. */
export async function findNearestCachedSpot(
  user: { latitude: number; longitude: number },
  radiusMeters: number = DEFAULT_RADIUS_METERS
): Promise<NearestSpotSuggestion | null> {
  try {
    const { rows } = await atlasClient.spotsLite();
    const spots = rows.map(([id, workKey, name, lat, lon, confidence, episodes]) => ({
      workKey,
      spot: {
        id,
        workKey,
        name,
        address: '',
        note: '',
        lat,
        lon,
        precision: null,
        confidence:
          confidence === 'c' ? 'confirmed' : confidence === 's' ? 'single' : 'unverified',
        scenes: episodes.map((episode) => ({ episode: `第${episode}話` })),
        sources: [],
      } satisfies PilgrimageSpot,
    }));
    return pickNearestWithin(spots, user, radiusMeters);
  } catch {
    return null;
  }
}
