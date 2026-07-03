// Pure spatial helpers for the point-level anitabi spots index. The SQLite lat/
// lng BETWEEN prefilter (in libs/db.ts) is a coarse box; this module turns a
// (lat,lng,radiusKm) into that box and does the exact haversine ranking in JS.
// Kept pure + separate so the distance math is unit-tested without SQLite.

export interface SpotIndexRow {
  /** anitabi point id (PRIMARY KEY in the anitabi_spots table). */
  pointId: string;
  bangumiId: number;
  lat: number;
  lng: number;
  /** Original-language name. */
  name: string;
  /** Chinese name; '' when absent. */
  cn: string;
  /** Scene image exactly as anitabi stores it (host-relative); normalized on read. */
  image: string;
}

export interface NearbySpotHit extends SpotIndexRow {
  /** Great-circle distance from the query point, kilometres. */
  distanceKm: number;
}

export interface LatLngBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

const KM_PER_DEG_LAT = 111;
const EARTH_RADIUS_KM = 6371;

/**
 * Bounding box that fully contains a `radiusKm` circle around (lat,lng). Used as
 * the SQLite prefilter; the caller then filters exactly by haversine. Longitude
 * degrees are divided by cos(lat) because meridians converge toward the poles.
 */
export function boundsForRadius(lat: number, lng: number, radiusKm: number): LatLngBox {
  const dLat = radiusKm / KM_PER_DEG_LAT;
  const cos = Math.max(Math.cos((lat * Math.PI) / 180), 1e-6);
  const dLng = radiusKm / (KM_PER_DEG_LAT * cos);
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  };
}

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function rankSpotsByDistance(
  candidates: readonly SpotIndexRow[],
  userLat: number,
  userLng: number,
  radiusKm: number,
  limit: number
): NearbySpotHit[] {
  const hits: NearbySpotHit[] = [];
  for (const c of candidates) {
    const distanceKm = haversineKm(userLat, userLng, c.lat, c.lng);
    if (distanceKm > radiusKm) continue;
    hits.push({ ...c, distanceKm });
  }
  hits.sort((a, b) => a.distanceKm - b.distanceKm);
  return limit > 0 ? hits.slice(0, limit) : hits;
}
