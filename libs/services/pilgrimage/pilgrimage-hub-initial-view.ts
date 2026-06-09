import { FEATURED_PILGRIMAGE_ANIME } from './featured-anime';
import { getIndexedById } from './anitabi-index';
import type { LatLng } from './location-service';
import type { AnitabiBangumi } from './types';
import type { PilgrimageHubMapViewport, PilgrimageHubSnapshot } from './pilgrimage-hub-cache';
import { buildSeededPilgrimageAnimes } from './pilgrimage-screen-state';

const HUB_FOCUS_ZOOM = 11;
const HUB_USER_ZOOM = 15;
const JAPAN_OVERVIEW_ZOOM = 5;
const USER_LOCATION_FRESH_MS = 5 * 60 * 1000;
const JAPAN_BOUNDS = {
  south: 24.0,
  west: 122.9,
  north: 45.6,
  east: 146.0,
} as const;
const JAPAN_CENTER = { lat: 36.5, lng: 138.0 } as const;

export interface PilgrimageHubInitialView {
  center?: { lat: number; lng: number };
  zoom?: number;
}

export interface PilgrimageHubInitialViewInput {
  focusBangumiId: number | null;
  snapshot: PilgrimageHubSnapshot | null;
  fallbackFeaturedIds?: readonly number[];
  now?: number;
}

export function resolvePilgrimageHubInitialView({
  focusBangumiId,
  snapshot,
  fallbackFeaturedIds = FEATURED_PILGRIMAGE_ANIME.map(({ bangumiId }) => bangumiId),
  now = Date.now(),
}: PilgrimageHubInitialViewInput): PilgrimageHubInitialView {
  const freshUserLocation = getFreshUserLocation(snapshot, now);
  if (freshUserLocation && pointInJapan(freshUserLocation)) {
    return toView(freshUserLocation.latitude, freshUserLocation.longitude, HUB_USER_ZOOM);
  }

  const mapViewport = getValidViewport(snapshot?.mapViewport);
  if (mapViewport) return mapViewport;

  const visitedCenter = getVisitedSceneCenter(snapshot);
  if (visitedCenter) return toView(visitedCenter.lat, visitedCenter.lng);

  if (focusBangumiId != null) {
    const focused = getIndexedById(focusBangumiId);
    if (focused && isFiniteGeo(focused.lat, focused.lng)) {
      return toView(focused.lat, focused.lng);
    }
    const snapshotFocused = findSnapshotAnime(snapshot, focusBangumiId);
    if (snapshotFocused && isValidAnimeGeo(snapshotFocused)) {
      return toView(snapshotFocused.geo[0], snapshotFocused.geo[1]);
    }
  }

  const candidates = buildInitialAnimeCandidates(snapshot, fallbackFeaturedIds);
  const selectedAnime = selectInitialAnime(candidates);
  if (selectedAnime && isValidAnimeGeo(selectedAnime)) {
    return toView(selectedAnime.geo[0], selectedAnime.geo[1]);
  }

  return { center: JAPAN_CENTER, zoom: JAPAN_OVERVIEW_ZOOM };
}

function findSnapshotAnime(
  snapshot: PilgrimageHubSnapshot | null,
  bangumiId: number
): AnitabiBangumi | null {
  for (const anime of snapshot?.collectionAnimes ?? []) {
    if (anime.id === bangumiId) return anime;
  }
  for (const anime of snapshot?.featuredAnimes ?? []) {
    if (anime.id === bangumiId) return anime;
  }
  return null;
}

function buildInitialAnimeCandidates(
  snapshot: PilgrimageHubSnapshot | null,
  fallbackFeaturedIds: readonly number[]
): AnitabiBangumi[] {
  const merged = new Map<number, AnitabiBangumi>();
  for (const anime of buildSeededPilgrimageAnimes(fallbackFeaturedIds)) {
    merged.set(anime.id, anime);
  }
  for (const anime of snapshot?.collectionAnimes ?? []) {
    merged.set(anime.id, anime);
  }
  for (const anime of snapshot?.featuredAnimes ?? []) {
    merged.set(anime.id, anime);
  }
  return [...merged.values()].filter(isValidAnimeGeo);
}

function selectInitialAnime(candidates: readonly AnitabiBangumi[]): AnitabiBangumi | null {
  if (candidates.length === 0) return null;
  const ranked = [...candidates];
  ranked.sort((a, b) => {
    return (b.pointsLength ?? 0) - (a.pointsLength ?? 0);
  });
  return ranked[0] ?? null;
}

function getFreshUserLocation(snapshot: PilgrimageHubSnapshot | null, now: number): LatLng | null {
  const loc = snapshot?.userLocation ?? null;
  if (!loc) return null;
  const updatedAt = snapshot?.userLocationUpdatedAt ?? snapshot?.updatedAt;
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) return null;
  if (now - updatedAt > USER_LOCATION_FRESH_MS) return null;
  return loc;
}

function getValidViewport(
  viewport: PilgrimageHubMapViewport | null | undefined
): PilgrimageHubInitialView | null {
  if (!viewport) return null;
  const { center, zoom } = viewport;
  if (!center || !isFiniteGeo(center.lat, center.lng) || !Number.isFinite(zoom)) return null;
  return { center: { lat: center.lat, lng: center.lng }, zoom };
}

function getVisitedSceneCenter(
  snapshot: PilgrimageHubSnapshot | null
): { lat: number; lng: number } | null {
  const visited = snapshot?.visited;
  if (!visited || Object.keys(visited).length === 0) return null;

  const seen = new Set<string>();
  let latSum = 0;
  let lngSum = 0;
  let count = 0;
  const animes = [...(snapshot?.collectionAnimes ?? []), ...(snapshot?.featuredAnimes ?? [])];

  for (const anime of animes) {
    for (const point of anime.litePoints ?? []) {
      if (seen.has(point.id) || visited[point.id] !== true) continue;
      if (!isFiniteGeo(point.geo[0], point.geo[1])) continue;
      seen.add(point.id);
      latSum += point.geo[0];
      lngSum += point.geo[1];
      count += 1;
    }
  }

  if (count === 0) return null;
  return { lat: latSum / count, lng: lngSum / count };
}

function isValidAnimeGeo(anime: AnitabiBangumi): anime is AnitabiBangumi & {
  geo: [number, number];
} {
  return Array.isArray(anime.geo) && isFiniteGeo(anime.geo[0], anime.geo[1]);
}

function isFiniteGeo(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
}

function pointInJapan(loc: LatLng): boolean {
  return (
    loc.latitude >= JAPAN_BOUNDS.south &&
    loc.latitude <= JAPAN_BOUNDS.north &&
    loc.longitude >= JAPAN_BOUNDS.west &&
    loc.longitude <= JAPAN_BOUNDS.east
  );
}

function toView(lat: number, lng: number, zoom: number = HUB_FOCUS_ZOOM): PilgrimageHubInitialView {
  return { center: { lat, lng }, zoom };
}
