import type { PilgrimageSpot, PilgrimageWork } from './types';
import type { LatLng } from './location-service';
import { locationService } from './location-service';
import type { VisitedMap } from './visited-prefs';
import type { MapMarker } from './map-engine/types';
import { getAll88Entries } from './anime88-repository';

export interface HomeMapAnime {
  anime: PilgrimageWork;
  spot: PilgrimageSpot;
  distanceKm?: number;
  visited: boolean;
  is88: boolean;
  fromCollection: boolean;
}

export function buildHomeMapAnimes(
  knownAnimes: readonly PilgrimageWork[],
  userLocation: LatLng | null,
  visited: VisitedMap,
  collectionIds: ReadonlySet<number>
): HomeMapAnime[] {
  const official88 = new Set(
    getAll88Entries().flatMap((entry) =>
      entry.externalIds.bangumi == null ? [] : [entry.externalIds.bangumi]
    )
  );

  return knownAnimes.flatMap((anime) =>
    anime.spots.flatMap((spot) => {
      if (spot.lat === null || spot.lon === null) return [];
      if (!Number.isFinite(spot.lat) || !Number.isFinite(spot.lon)) return [];
      const distance = userLocation
        ? locationService.getDistanceKm(userLocation, {
            latitude: spot.lat,
            longitude: spot.lon,
          })
        : undefined;
      return [{
        anime,
        spot,
        distanceKm: distance !== undefined && Number.isFinite(distance) ? distance : undefined,
        visited: visited[spot.id] === true,
        is88: (anime.bgm ?? []).some((id) => official88.has(id)),
        fromCollection: (anime.bgm ?? []).some((id) => collectionIds.has(id)),
      }];
    })
  );
}

export function buildHomeMapMarkers(entries: readonly HomeMapAnime[], accent: string): MapMarker[] {
  return entries.map(({ anime, spot, visited }) => ({
    id: `atlas:${anime.key}:${spot.id}`,
    kind: 'spot',
    lat: spot.lat as number,
    lng: spot.lon as number,
    title: spot.name,
    episode: episodeNumber(spot),
    color: accent,
    visited,
  }));
}

function episodeNumber(spot: PilgrimageSpot): number | undefined {
  for (const scene of spot.scenes) {
    const match = scene.episode.match(/\d+/);
    if (match) return Number(match[0]);
  }
  return undefined;
}
