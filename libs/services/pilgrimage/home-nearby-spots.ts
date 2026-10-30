import type { AnitabiBangumi } from './types';
import type { LatLng } from './location-service';
import { haversineKm, type NearbySpotHit } from './spot-index';

interface HomeNearbyInput {
  userLocation: LatLng;
  animes: readonly AnitabiBangumi[];
  indexNearest: NearbySpotHit | null;
  indexWithin3Km: readonly NearbySpotHit[];
  /** null while the SQLite index query is still pending. */
  indexCount: number | null;
}

export interface HomeNearbyResult {
  nearestSpot: NearbySpotHit | null;
  nearbyCount: number;
  /** An empty radius is only meaningful once the SQLite index has rows. */
  coverage: 'known' | 'unknown';
}

const NEARBY_RADIUS_KM = 3;
const HERO_RADIUS_KM = 50;

/** Merge the indexed points with the sampled litePoints without inventing coverage. */
export function resolveHomeNearbySpots({
  userLocation,
  animes,
  indexNearest,
  indexWithin3Km,
  indexCount,
}: HomeNearbyInput): HomeNearbyResult {
  const byPoint = new Map<string, NearbySpotHit>();
  const add = (hit: NearbySpotHit) => {
    if (hit.distanceKm > HERO_RADIUS_KM) return;
    const key = `${hit.bangumiId}:${hit.pointId}`;
    const previous = byPoint.get(key);
    if (!previous || hit.distanceKm < previous.distanceKm) byPoint.set(key, hit);
  };

  if (indexNearest) add(indexNearest);
  for (const hit of indexWithin3Km) add(hit);
  for (const anime of animes) {
    for (const point of anime.litePoints ?? []) {
      const [lat, lng] = point.geo ?? [];
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;
      const distanceKm = haversineKm(userLocation.latitude, userLocation.longitude, lat, lng);
      add({
        pointId: point.id,
        bangumiId: anime.id,
        lat,
        lng,
        name: point.name,
        cn: point.cn ?? '',
        image: point.image,
        distanceKm,
      });
    }
  }

  const hits = [...byPoint.values()].sort((a, b) => a.distanceKm - b.distanceKm);
  return {
    nearestSpot: hits[0] ?? null,
    nearbyCount: hits.filter((hit) => hit.distanceKm <= NEARBY_RADIUS_KM).length,
    coverage: indexCount !== null && indexCount > 0 ? 'known' : 'unknown',
  };
}
