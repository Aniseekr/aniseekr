import { useCallback, useMemo } from 'react';
import { locationService, type LatLng } from '../libs/services/pilgrimage/location-service';
import type { PilgrimageSpot, PilgrimageWork } from '../libs/services/pilgrimage/types';
import type { PilgrimageSpotFilter } from '../libs/services/pilgrimage/pilgrimage-detail-filter';
import type { SpotIntentMap } from '../libs/services/pilgrimage/spot-intents';
import type { PilgrimageCapture } from '../libs/services/pilgrimage/captures';
import type { VisitedMap } from '../libs/services/pilgrimage/visited-prefs';

export interface SpotStats {
  spotCount: number;
  radiusKm: number;
}

export interface UserSpotStats {
  visitedCount: number;
  capturedCount: number;
}

export interface PilgrimageSpotFilterCounts {
  all: number;
  visited: number;
  unvisited: number;
  photos: number;
  saved: number;
  planned: number;
}

export interface UsePilgrimageDerivedSpotsResult {
  groupedSpots: readonly PilgrimageSpot[];
  groupedSpotByPointId: Map<string, PilgrimageSpot>;
  filteredGroupedSpots: readonly PilgrimageSpot[];
  filteredPoints: readonly PilgrimageSpot[];
  groupedCounts: PilgrimageSpotFilterCounts;
  normalizedSpotSearchQuery: string;
  spotStats: SpotStats;
  userStats: UserSpotStats;
  distanceFor: (spot: PilgrimageSpot) => number | null;
  distanceForGroup: (group: PilgrimageSpot) => number | null;
  representativeForGroup: (group: PilgrimageSpot) => PilgrimageSpot;
}

export interface UsePilgrimageDerivedSpotsArgs {
  anime: PilgrimageWork | null;
  points: readonly PilgrimageSpot[];
  userLocation: LatLng | null;
  visited: VisitedMap;
  captures: Record<string, PilgrimageCapture>;
  spotIntents: SpotIntentMap;
  spotFilter: PilgrimageSpotFilter;
  spotSearchQuery: string;
}

export function usePilgrimageDerivedSpots({
  anime,
  points,
  userLocation,
  visited,
  captures,
  spotIntents,
  spotFilter,
  spotSearchQuery,
}: UsePilgrimageDerivedSpotsArgs): UsePilgrimageDerivedSpotsResult {
  const spotStats = useMemo<SpotStats>(() => {
    const mapped = points.filter(hasLocation);
    let radiusKm = 0;
    if (mapped.length > 1) {
      const center = mapped.reduce(
        (sum, spot) => ({
          latitude: sum.latitude + spot.lat / mapped.length,
          longitude: sum.longitude + spot.lon / mapped.length,
        }),
        { latitude: 0, longitude: 0 }
      );
      for (const spot of mapped) {
        const distance = locationService.getDistanceKm(center, {
          latitude: spot.lat,
          longitude: spot.lon,
        });
        if (Number.isFinite(distance)) radiusKm = Math.max(radiusKm, distance);
      }
    }
    return { spotCount: anime?.n ?? points.length, radiusKm };
  }, [anime, points]);

  const userStats = useMemo<UserSpotStats>(
    () => ({
      visitedCount: points.filter((spot) => visited[spot.id] === true).length,
      capturedCount: points.filter((spot) => !!captures[spot.id]).length,
    }),
    [points, visited, captures]
  );

  const groupedSpots = points;
  const groupedSpotByPointId = useMemo(
    () => new Map(points.map((spot) => [spot.id, spot])),
    [points]
  );
  const normalizedSpotSearchQuery = normalizeQuery(spotSearchQuery);

  const rankedSpots = useMemo(() => {
    const rank = (spot: PilgrimageSpot) => {
      const intent = spotIntents[spot.id];
      return intent?.saved && intent.planned ? 3 : intent?.planned ? 2 : intent?.saved ? 1 : 0;
    };
    return [...points].sort((a, b) => {
      const intentOrder = rank(b) - rank(a);
      if (intentOrder !== 0) return intentOrder;
      const aDistance = getDistance(a, userLocation);
      const bDistance = getDistance(b, userLocation);
      return (aDistance ?? Number.POSITIVE_INFINITY) - (bDistance ?? Number.POSITIVE_INFINITY);
    });
  }, [points, spotIntents, userLocation]);

  const searchedSpots = useMemo(
    () => rankedSpots.filter((spot) => spotMatchesQuery(spot, normalizedSpotSearchQuery)),
    [rankedSpots, normalizedSpotSearchQuery]
  );
  const groupedCounts = useMemo(
    () => countFilters(searchedSpots, visited, captures, spotIntents),
    [searchedSpots, visited, captures, spotIntents]
  );
  const filteredGroupedSpots = useMemo(
    () =>
      searchedSpots.filter((spot) =>
        matchesFilter(spot, spotFilter, visited, captures, spotIntents)
      ),
    [searchedSpots, spotFilter, visited, captures, spotIntents]
  );

  const distanceFor = useCallback(
    (spot: PilgrimageSpot) => getDistance(spot, userLocation),
    [userLocation]
  );
  const distanceForGroup = distanceFor;
  const representativeForGroup = useCallback((spot: PilgrimageSpot) => spot, []);

  return {
    groupedSpots,
    groupedSpotByPointId,
    filteredGroupedSpots,
    filteredPoints: filteredGroupedSpots,
    groupedCounts,
    normalizedSpotSearchQuery,
    spotStats,
    userStats,
    distanceFor,
    distanceForGroup,
    representativeForGroup,
  };
}

function hasLocation(spot: PilgrimageSpot): spot is PilgrimageSpot & { lat: number; lon: number } {
  return (
    spot.lat !== null && spot.lon !== null && Number.isFinite(spot.lat) && Number.isFinite(spot.lon)
  );
}

function getDistance(spot: PilgrimageSpot, userLocation: LatLng | null): number | null {
  if (!userLocation || !hasLocation(spot)) return null;
  const distance = locationService.getDistanceKm(userLocation, {
    latitude: spot.lat,
    longitude: spot.lon,
  });
  return Number.isFinite(distance) ? distance : null;
}

function normalizeQuery(query: string): string {
  return query.normalize('NFKC').trim().toLowerCase();
}

function spotMatchesQuery(spot: PilgrimageSpot, query: string): boolean {
  if (!query) return true;
  const episodeQuery = query.match(/^(?:ep|episode|第)?0*(\d+)(?:話|话|集)?$/);
  if (episodeQuery) {
    const episode = Number(episodeQuery[1]);
    return spot.scenes.some((scene) => Number(scene.episode.match(/\d+/)?.[0]) === episode);
  }
  const fields = [spot.name, spot.address, ...spot.scenes.map((scene) => scene.episode)];
  return fields.some((value) => normalizeQuery(value).includes(query));
}

function matchesFilter(
  spot: PilgrimageSpot,
  filter: PilgrimageSpotFilter,
  visited: VisitedMap,
  captures: Record<string, PilgrimageCapture>,
  intents: SpotIntentMap
): boolean {
  switch (filter) {
    case 'visited':
      return visited[spot.id] === true;
    case 'unvisited':
      return visited[spot.id] !== true;
    case 'photos':
      return !!captures[spot.id];
    case 'saved':
      return intents[spot.id]?.saved === true;
    case 'planned':
      return intents[spot.id]?.planned === true;
    default:
      return true;
  }
}

function countFilters(
  spots: readonly PilgrimageSpot[],
  visited: VisitedMap,
  captures: Record<string, PilgrimageCapture>,
  intents: SpotIntentMap
): PilgrimageSpotFilterCounts {
  const visitedCount = spots.filter((spot) => visited[spot.id] === true).length;
  return {
    all: spots.length,
    visited: visitedCount,
    unvisited: spots.length - visitedCount,
    photos: spots.filter((spot) => !!captures[spot.id]).length,
    saved: spots.filter((spot) => intents[spot.id]?.saved === true).length,
    planned: spots.filter((spot) => intents[spot.id]?.planned === true).length,
  };
}
