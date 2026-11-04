import { atlasClient } from './atlas/atlas-client';
import type { LatLng } from './location-service';
import { boundsForRadius, rankSpotsByDistance, type LatLngBox, type NearbySpotHit, type SpotIndexRow } from './spot-index';

export async function getSpotsNear(
  userLocation: LatLng,
  radiusKm: number,
  limit: number
): Promise<NearbySpotHit[]> {
  const box = boundsForRadius(userLocation.latitude, userLocation.longitude, radiusKm);
  const rows = await getSpotsInBounds(box, limit * 8);
  return rankSpotsByDistance(rows, userLocation.latitude, userLocation.longitude, radiusKm, limit);
}

export async function getSpotsInBounds(
  bbox: LatLngBox,
  limit: number
): Promise<SpotIndexRow[]> {
  const { rows } = await atlasClient.spotsLite();
  return rows
    .filter((row) => row[3] >= bbox.minLat && row[3] <= bbox.maxLat && row[4] >= bbox.minLng && row[4] <= bbox.maxLng)
    .slice(0, limit > 0 ? limit : undefined)
    .map(([spotId, workKey, name, lat, lon, confidence, episodes]) => ({
      spotId,
      workKey,
      name,
      lat,
      lon,
      confidence: confidence === 'c' ? 'confirmed' : confidence === 's' ? 'single' : 'unverified',
      episodes,
    }));
}

export async function getSpotIndexCount(): Promise<number> {
  return (await atlasClient.spotsLite()).rows.length;
}
