import type { PilgrimageSpot, PilgrimageWork } from './types';
import type { LatLng } from './location-service';
import { getSpotDistanceKm } from './spot-distance-sort';

export interface NearbySpot {
  id: string;
  markerId: string;
  workKey: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
  confidence: PilgrimageSpot['confidence'];
  episodes: string[];
  distanceKm: number;
}

const DEFAULT_MAX_SPOTS = 80;

export function buildNearbySpots(
  works: ReadonlyArray<PilgrimageWork | null | undefined>,
  userLocation: LatLng,
  maxSpots = DEFAULT_MAX_SPOTS
): NearbySpot[] {
  const rows: NearbySpot[] = [];
  for (const work of works) {
    if (!work) continue;
    for (const spot of work.spots) {
      const distanceKm = getSpotDistanceKm(spot, userLocation);
      if (distanceKm === null || spot.lat === null || spot.lon === null) continue;
      rows.push(toNearbySpot(work.key, spot, distanceKm));
    }
  }
  return rows.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, Math.max(0, maxSpots));
}

export function buildNearbySpotsFromIndex(
  rows: readonly NearbySpot[],
  collectionWorkKeys: ReadonlySet<string> = new Set()
): NearbySpot[] {
  return [...rows].sort((a, b) => {
    const aCollection = collectionWorkKeys.has(a.workKey) ? 0 : 1;
    const bCollection = collectionWorkKeys.has(b.workKey) ? 0 : 1;
    return aCollection - bCollection || a.distanceKm - b.distanceKm;
  });
}

export function toNearbySpot(workKey: string, spot: PilgrimageSpot, distanceKm: number): NearbySpot {
  return {
    id: spot.id,
    markerId: `${workKey}:${spot.id}`,
    workKey,
    name: spot.name,
    address: spot.address,
    lat: spot.lat as number,
    lon: spot.lon as number,
    confidence: spot.confidence,
    episodes: spot.scenes.map((scene) => scene.episode),
    distanceKm,
  };
}
