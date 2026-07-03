// Thin service over the anitabi_spots SQLite table: turns a user location +
// radius into a distance-ranked list of point-level spots. The db access is
// injectable (deps.queryBox) so getSpotsNear is unit-testable without SQLite.

import { LocalDB } from '../../db';
import type { LatLng } from './location-service';
import {
  boundsForRadius,
  rankSpotsByDistance,
  type LatLngBox,
  type NearbySpotHit,
  type SpotIndexRow,
} from './spot-index';
import type { BoundingBox } from './anitabi-index';

export async function getSpotsNear(
  userLocation: LatLng,
  radiusKm: number,
  limit: number,
  deps: { queryBox?: (box: LatLngBox) => Promise<SpotIndexRow[]> } = {}
): Promise<NearbySpotHit[]> {
  const queryBox = deps.queryBox ?? ((box: LatLngBox) => LocalDB.queryAnitabiSpotsByBox(box));
  const box = boundsForRadius(userLocation.latitude, userLocation.longitude, radiusKm);
  const candidates = await queryBox(box);
  return rankSpotsByDistance(
    candidates,
    userLocation.latitude,
    userLocation.longitude,
    radiusKm,
    limit
  );
}

export async function getSpotsInBounds(
  bbox: BoundingBox,
  limit: number,
  deps: {
    queryBounds?: (b: BoundingBox, l: number) => Promise<SpotIndexRow[]>;
  } = {}
): Promise<SpotIndexRow[]> {
  const queryBounds =
    deps.queryBounds ?? ((b: BoundingBox, l: number) => LocalDB.queryAnitabiSpotsInBounds(b, l));
  return queryBounds(bbox, limit);
}

export async function getSpotIndexCount(): Promise<number> {
  return LocalDB.getAnitabiSpotCount();
}
