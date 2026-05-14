import { getAnimeNear, type AnitabiIndexEntry } from './anitabi-index';
import type { LatLng } from './location-service';

export const MAP_LOCATE_RADIUS_KM = 30;
export const MAP_LOCATE_LIMIT = 60;
export const MAP_LOCATE_ZOOM = 12;

export type NearbyMapEntry = AnitabiIndexEntry & { distanceKm: number };

interface NearbyMapOptions {
  exclude?: ReadonlySet<number> | readonly number[];
  limit?: number;
  radiusKm?: number;
}

export function getNearbyMapEntries(
  userLocation: LatLng | null | undefined,
  options: NearbyMapOptions = {}
): NearbyMapEntry[] {
  if (!userLocation) return [];
  return getAnimeNear(
    {
      lat: userLocation.latitude,
      lng: userLocation.longitude,
      radiusKm: options.radiusKm ?? MAP_LOCATE_RADIUS_KM,
    },
    {
      exclude: options.exclude,
      limit: options.limit ?? MAP_LOCATE_LIMIT,
    }
  );
}
