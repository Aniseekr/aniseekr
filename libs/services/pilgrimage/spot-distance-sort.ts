import type { AtlasScene } from './atlas/types';
import type { LatLng } from './location-service';
import type { PilgrimageSpot } from './types';

const EARTH_RADIUS_KM = 6371;

function distanceKm(userLocation: LatLng, lat: number, lon: number): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(lat - userLocation.latitude);
  const dLon = toRad(lon - userLocation.longitude);
  const lat1 = toRad(userLocation.latitude);
  const lat2 = toRad(lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function getSpotDistanceKm(
  spot: PilgrimageSpot,
  userLocation: LatLng | null | undefined
): number | null {
  if (!userLocation || spot.lat === null || spot.lon === null) return null;
  if (!Number.isFinite(spot.lat) || !Number.isFinite(spot.lon)) return null;
  return distanceKm(userLocation, spot.lat, spot.lon);
}

export function getNearestSceneForSpot(
  spot: PilgrimageSpot,
  _userLocation: LatLng | null | undefined
): AtlasScene | null {
  return spot.scenes[0] ?? null;
}

export function sortSpotsByDistance<T extends PilgrimageSpot>(
  spots: readonly T[],
  userLocation: LatLng | null | undefined
): T[] {
  if (!userLocation) return [...spots];
  return spots
    .map((spot, index) => ({ spot, index, distanceKm: getSpotDistanceKm(spot, userLocation) }))
    .sort((a, b) => {
      if (a.distanceKm === null && b.distanceKm === null) return a.index - b.index;
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      return a.distanceKm - b.distanceKm || a.index - b.index;
    })
    .map(({ spot }) => spot);
}
