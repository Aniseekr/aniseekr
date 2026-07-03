// Builds the list of individual pilgrimage spots near the user, used by the
// fullscreen map for its on-map scene points and its Nearby panel.
//
// The fullscreen map otherwise shows one centroid marker per anime. "Nearby"
// expands the closest anime into their real-world scene locations: fetch each
// anime's lite payload, collapse its scene-cuts into spots, tag every spot with
// its distance to the user, and sort nearest-first.

import { groupPointsIntoSpots } from './anitabi-points';
import { normalizeAnitabiImageUrl } from './anitabi-image';
import type { LatLng } from './location-service';
import type { NearbySpotHit } from './spot-index';
import type { AnitabiBangumi } from './types';

export interface NearbySpot {
  /** Representative scene-point id within its anime. */
  id: string;
  /** Map-unique marker id, stable across anime: "<animeId>:<spotId>". */
  markerId: string;
  /** Display name (Chinese when available, else Japanese). */
  name: string;
  lat: number;
  lng: number;
  /** Scene screenshot for the representative cut. */
  image: string;
  /** Episode of the representative scene-cut. */
  ep: number;
  /** Number of anime scene-cuts grouped at this real-world location. */
  sceneCount: number;
  /** Great-circle distance from the user, in kilometres. */
  distanceKm: number;
  animeId: number;
  animeTitle: string;
  /** Anime theme colour hex (marker ring). Empty when Anitabi has none. */
  ringColor: string;
}

const DEFAULT_MAX_SPOTS = 80;
const EARTH_RADIUS_KM = 6371;

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function hasGeo(geo: readonly [number, number]): boolean {
  return Number.isFinite(geo[0]) && Number.isFinite(geo[1]) && !(geo[0] === 0 && geo[1] === 0);
}

/**
 * Pure transform: collapse already-fetched anime payloads into a
 * distance-sorted {@link NearbySpot} list. Anime with no usable points or geo
 * are skipped.
 */
export function buildNearbySpots(
  bangumiList: ReadonlyArray<AnitabiBangumi | null | undefined>,
  userLocation: LatLng,
  maxSpots: number = DEFAULT_MAX_SPOTS
): NearbySpot[] {
  const out: NearbySpot[] = [];
  for (const bangumi of bangumiList) {
    if (!bangumi) continue;
    const animeTitle = bangumi.cn || bangumi.title || '';
    const spots = groupPointsIntoSpots(bangumi.litePoints ?? []);
    for (const spot of spots) {
      if (!hasGeo(spot.geo)) continue;
      const distanceKm = haversineKm(
        userLocation.latitude,
        userLocation.longitude,
        spot.geo[0],
        spot.geo[1]
      );
      if (!Number.isFinite(distanceKm)) continue;
      out.push({
        id: spot.id,
        markerId: `${bangumi.id}:${spot.id}`,
        name: spot.cn || spot.name,
        lat: spot.geo[0],
        lng: spot.geo[1],
        image: spot.image,
        ep: spot.scenes[0]?.ep ?? 0,
        sceneCount: spot.scenes.length,
        distanceKm,
        animeId: bangumi.id,
        animeTitle,
        ringColor: bangumi.color || '',
      });
    }
  }
  out.sort((a, b) => a.distanceKm - b.distanceKm);
  return out.slice(0, Math.max(0, maxSpots));
}

/**
 * Build {@link NearbySpot}s directly from point-level index hits (the SQLite
 * anitabi_spots query result), used by the global "sacred sites near me"
 * surfaces. Collection anime float to the top, then by distance. The stored
 * `image` is a host-relative anitabi path, so it is normalized to an absolute
 * CDN thumbnail here — SpotImage only renders absolute http(s) URLs.
 *
 * `ep`/`sceneCount` are not carried by the flat index (it's one row per point,
 * not grouped), so they are 0/1 — honest placeholders that render as
 * "no episode badge / single scene", never fabricated counts (Rule 8).
 */
export function buildNearbySpotsFromIndex(
  hits: readonly NearbySpotHit[],
  lookup: (bangumiId: number) => { title: string; cn: string; color: string } | null,
  collectionIds: ReadonlySet<number>
): NearbySpot[] {
  const out: NearbySpot[] = hits.map((h) => {
    const anime = lookup(h.bangumiId);
    return {
      id: h.pointId,
      markerId: `${h.bangumiId}:${h.pointId}`,
      name: h.cn || h.name,
      lat: h.lat,
      lng: h.lng,
      image: normalizeAnitabiImageUrl(h.image, h.bangumiId),
      ep: 0,
      sceneCount: 1,
      distanceKm: h.distanceKm,
      animeId: h.bangumiId,
      animeTitle: anime?.cn || anime?.title || '',
      ringColor: anime?.color || '',
    };
  });
  out.sort((a, b) => {
    const aCol = collectionIds.has(a.animeId) ? 0 : 1;
    const bCol = collectionIds.has(b.animeId) ? 0 : 1;
    if (aCol !== bCol) return aCol - bCol;
    return a.distanceKm - b.distanceKm;
  });
  return out;
}
