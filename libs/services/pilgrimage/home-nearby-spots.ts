import type { PilgrimageWork } from './types';
import type { LatLng } from './location-service';
import { haversineKm, type NearbySpotHit } from './spot-index';

interface HomeNearbyInput {
  userLocation: LatLng;
  animes: readonly PilgrimageWork[];
  indexNearest: NearbySpotHit | null;
  indexWithin3Km: readonly NearbySpotHit[];
  indexCount: number | null;
}

export interface HomeNearbyResult {
  nearestSpot: NearbySpotHit | null;
  nearbySpots: NearbySpotHit[];
  nearbyCount: number;
  coverage: 'known' | 'unknown';
}

const NEARBY_RADIUS_KM = 3;
const HERO_RADIUS_KM = 50;

export function resolveHomeNearbySpots({
  userLocation,
  animes,
  indexNearest,
  indexWithin3Km,
  indexCount,
}: HomeNearbyInput): HomeNearbyResult {
  const bySpot = new Map<string, NearbySpotHit>();
  const add = (hit: NearbySpotHit) => {
    if (hit.distanceKm <= HERO_RADIUS_KM) bySpot.set(`${hit.workKey}:${hit.spotId}`, hit);
  };
  if (indexNearest) add(indexNearest);
  for (const hit of indexWithin3Km) add(hit);
  for (const work of animes) {
    for (const spot of work.spots) {
      if (spot.lat === null || spot.lon === null) continue;
      const distanceKm = haversineKm(
        userLocation.latitude,
        userLocation.longitude,
        spot.lat,
        spot.lon
      );
      add({
        spotId: spot.id,
        workKey: work.key,
        lat: spot.lat,
        lon: spot.lon,
        name: spot.name,
        confidence: spot.confidence,
        episodes: spot.scenes.flatMap((scene) => {
          const match = scene.episode.match(/\d+/);
          return match ? [Number(match[0])] : [];
        }),
        distanceKm,
      });
    }
  }
  const hits = [...bySpot.values()].sort((a, b) => a.distanceKm - b.distanceKm);
  const nearbySpots = hits.filter((hit) => hit.distanceKm <= NEARBY_RADIUS_KM);
  return {
    nearestSpot: hits[0] ?? null,
    nearbySpots,
    nearbyCount: nearbySpots.length,
    coverage: indexCount !== null && indexCount > 0 ? 'known' : 'unknown',
  };
}
