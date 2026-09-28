import type { AnitabiBangumi } from './types';
import type { LatLng } from './location-service';
import { locationService } from './location-service';
import type { VisitedMap } from './visited-prefs';
import type { MapMarker } from './map-engine/types';
import { getPilgrimageAnimeTitles } from './pilgrimage-localization';
import { getAll88Entries } from './anime88-repository';

export interface HomeMapAnime {
  anime: AnitabiBangumi;
  distanceKm?: number;
  visitedCount: number;
  is88: boolean;
  fromCollection: boolean;
}

export function buildHomeMapAnimes(
  knownAnimes: readonly AnitabiBangumi[],
  userLocation: LatLng | null,
  visited: VisitedMap,
  collectionIds: ReadonlySet<number>
): HomeMapAnime[] {
  const official88 = new Set(
    getAll88Entries().flatMap((entry) =>
      entry.externalIds.bangumi == null ? [] : [entry.externalIds.bangumi]
    )
  );
  return knownAnimes.flatMap((anime) => {
    if (
      !anime.geo ||
      !Number.isFinite(anime.geo[0]) ||
      !Number.isFinite(anime.geo[1]) ||
      (anime.geo[0] === 0 && anime.geo[1] === 0)
    )
      return [];
    const distance = userLocation
      ? locationService.getDistanceKm(userLocation, {
          latitude: anime.geo[0],
          longitude: anime.geo[1],
        })
      : undefined;
    return [
      {
        anime,
        distanceKm: distance !== undefined && Number.isFinite(distance) ? distance : undefined,
        visitedCount: (anime.litePoints ?? []).filter((point) => visited[point.id]).length,
        is88: official88.has(anime.id),
        fromCollection: collectionIds.has(anime.id),
      },
    ];
  });
}

export function buildHomeMapMarkers(entries: readonly HomeMapAnime[], accent: string): MapMarker[] {
  return entries.map(({ anime, visitedCount }) => ({
    id: `bgm:${anime.id}`,
    kind: 'anime',
    bangumiId: anime.id,
    lat: anime.geo[0],
    lng: anime.geo[1],
    image: anime.cover ?? '',
    title: getPilgrimageAnimeTitles(anime).primary,
    city: anime.city ?? '',
    pointsLength: anime.pointsLength ?? 0,
    color: anime.color || accent,
    visited: visitedCount > 0,
  }));
}
