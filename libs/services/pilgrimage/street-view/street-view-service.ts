import { Platform } from 'react-native';
import { CacheService } from '../../cache-service';
import { MapillaryClient, type MapillaryImage } from './mapillary-client';

export const LOOK_AROUND_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAPILLARY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface LookAroundProvider {
  hasScene(latitude: number, longitude: number): Promise<boolean>;
}

export interface StreetViewMapillaryClient {
  findNearbyImages(latitude: number, longitude: number): Promise<MapillaryImage[] | null>;
}

export interface StreetViewCache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlMs: number): Promise<void>;
}

export interface StreetViewResolveOptions {
  platform?: string;
  lookAroundProvider?: LookAroundProvider | null;
  mapillaryClient?: StreetViewMapillaryClient;
  cache?: StreetViewCache;
}

export type StreetViewResult =
  | {
      kind: 'lookaround';
      latitude: number;
      longitude: number;
    }
  | {
      kind: 'mapillary';
      latitude: number;
      longitude: number;
      images: MapillaryImage[];
      googleMapsPanoUrl: string;
      attribution: '© Mapillary CC BY-SA';
    };

const defaultMapillaryClient: StreetViewMapillaryClient = {
  findNearbyImages(latitude: number, longitude: number) {
    return MapillaryClient.findNearbyImages(latitude, longitude);
  },
};

export async function resolveStreetView(
  latitude: number,
  longitude: number,
  opts: StreetViewResolveOptions = {}
): Promise<StreetViewResult | null> {
  if (!isFiniteCoordinate(latitude, longitude)) return null;

  const platform = opts.platform ?? Platform.OS;
  const cache = opts.cache ?? CacheService;
  const mapillaryClient = opts.mapillaryClient ?? defaultMapillaryClient;

  if (platform === 'ios') {
    const hasLookAround = await resolveLookAroundAvailability(
      latitude,
      longitude,
      opts.lookAroundProvider ?? null,
      cache
    );
    if (hasLookAround) {
      return { kind: 'lookaround', latitude, longitude };
    }
  }

  return resolveMapillary(latitude, longitude, mapillaryClient, cache);
}

export function buildGoogleMapsStreetViewUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${formatCoordinate(latitude)},${formatCoordinate(longitude)}`;
}

async function resolveLookAroundAvailability(
  latitude: number,
  longitude: number,
  provider: LookAroundProvider | null,
  cache: StreetViewCache
): Promise<boolean> {
  const cacheKey = lookAroundCacheKey(latitude, longitude);
  const cached = await safeCacheGet<boolean>(cache, cacheKey);
  if (cached === true || cached === false) return cached;
  if (!provider) return false;

  try {
    const hasScene = await provider.hasScene(latitude, longitude);
    await safeCacheSet(cache, cacheKey, hasScene, LOOK_AROUND_CACHE_TTL_MS);
    return hasScene;
  } catch {
    return false;
  }
}

async function resolveMapillary(
  latitude: number,
  longitude: number,
  mapillaryClient: StreetViewMapillaryClient,
  cache: StreetViewCache
): Promise<StreetViewResult | null> {
  const cacheKey = mapillaryCacheKey(latitude, longitude);
  const cached = await safeCacheGet<MapillaryImage[]>(cache, cacheKey);
  if (Array.isArray(cached)) {
    return cached.length > 0 ? toMapillaryResult(latitude, longitude, cached) : null;
  }

  let images: MapillaryImage[] | null;
  try {
    images = await mapillaryClient.findNearbyImages(latitude, longitude);
  } catch {
    return null;
  }
  if (!images || images.length === 0) return null;

  await safeCacheSet(cache, cacheKey, images, MAPILLARY_CACHE_TTL_MS);
  return toMapillaryResult(latitude, longitude, images);
}

function toMapillaryResult(
  latitude: number,
  longitude: number,
  images: MapillaryImage[]
): StreetViewResult {
  return {
    kind: 'mapillary',
    latitude,
    longitude,
    images,
    googleMapsPanoUrl: buildGoogleMapsStreetViewUrl(latitude, longitude),
    attribution: '© Mapillary CC BY-SA',
  };
}

async function safeCacheGet<T>(cache: StreetViewCache, key: string): Promise<T | null> {
  try {
    return await cache.get<T>(key);
  } catch {
    return null;
  }
}

async function safeCacheSet(
  cache: StreetViewCache,
  key: string,
  value: unknown,
  ttlMs: number
): Promise<void> {
  try {
    await cache.set(key, value, ttlMs);
  } catch {
    // Cache failures should not hide street view metadata.
  }
}

function lookAroundCacheKey(latitude: number, longitude: number): string {
  return `street-view:lookaround:${coordinateCacheKey(latitude, longitude)}`;
}

function mapillaryCacheKey(latitude: number, longitude: number): string {
  return `street-view:mapillary:${coordinateCacheKey(latitude, longitude)}`;
}

function coordinateCacheKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
}

function isFiniteCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function formatCoordinate(value: number): string {
  return Number(value.toFixed(6)).toString();
}
