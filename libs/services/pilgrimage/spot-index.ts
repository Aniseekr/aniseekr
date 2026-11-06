export interface SpotIndexRow {
  spotId: string;
  workKey: string;
  lat: number;
  lon: number;
  name: string;
  confidence: 'confirmed' | 'single' | 'unverified';
  episodes: number[];
}

export interface NearbySpotHit extends SpotIndexRow {
  distanceKm: number;
}

export interface LatLngBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

const EARTH_RADIUS_KM = 6371;

export function boundsForRadius(lat: number, lng: number, radiusKm: number): LatLngBox {
  const deltaLat = radiusKm / 111;
  const cos = Math.max(Math.cos((lat * Math.PI) / 180), 1e-6);
  const deltaLng = radiusKm / (111 * cos);
  return {
    minLat: lat - deltaLat,
    maxLat: lat + deltaLat,
    minLng: lng - deltaLng,
    maxLng: lng + deltaLng,
  };
}

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function rankSpotsByDistance(
  candidates: readonly SpotIndexRow[],
  userLat: number,
  userLng: number,
  radiusKm: number,
  limit: number
): NearbySpotHit[] {
  return candidates
    .map((spot) => ({ ...spot, distanceKm: haversineKm(userLat, userLng, spot.lat, spot.lon) }))
    .filter((spot) => spot.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit > 0 ? limit : undefined);
}
