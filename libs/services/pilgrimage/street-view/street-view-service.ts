import { Platform } from 'react-native';
import { CacheService } from '../../cache-service';
import { formatCoordinate, isFiniteCoordinate } from './coords';
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

export interface StreetViewSyncCache {
  getSync<T>(key: string): T | null;
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

export interface StreetViewPeekOptions {
  platform?: string;
  cacheSync?: StreetViewSyncCache;
}

/**
 * Synchronous warm-cache read of what {@link resolveStreetView} would return.
 *
 * Returns a definite result only when the cached entries fully determine the
 * async fallback chain — otherwise `undefined` (unknown, caller shows its
 * loading state). Exists so warm opens paint the card on the first frame
 * instead of flashing a skeleton (CLAUDE.md Rule 10).
 */
export function peekStreetView(
  latitude: number,
  longitude: number,
  opts: StreetViewPeekOptions = {}
): StreetViewResult | null | undefined {
  if (!isFiniteCoordinate(latitude, longitude)) return null;

  const platform = opts.platform ?? Platform.OS;
  const cacheSync = opts.cacheSync ?? CacheService;

  if (platform === 'ios') {
    const hasLookAround = safeCacheGetSync<boolean>(
      cacheSync,
      lookAroundCacheKey(latitude, longitude)
    );
    if (hasLookAround === true) return { kind: 'lookaround', latitude, longitude };
    // Unknown availability: the async chain might still pick Look Around, so
    // a cached Mapillary answer alone must not pre-empt it.
    if (hasLookAround !== false) return undefined;
  }

  const cached = safeCacheGetSync<MapillaryImage[]>(
    cacheSync,
    mapillaryCacheKey(latitude, longitude)
  );
  if (!Array.isArray(cached)) return undefined;
  return cached.length > 0 ? toMapillaryResult(latitude, longitude, cached) : null;
}

/**
 * Overwrites a (possibly stale) positive Look Around availability verdict.
 * Called when the native preview reports the scene actually failed to load,
 * so the next resolve falls through to Mapillary instead of trusting a
 * 30-day-old `true`.
 */
export async function markLookAroundUnavailable(
  latitude: number,
  longitude: number,
  cache: StreetViewCache = CacheService
): Promise<void> {
  if (!isFiniteCoordinate(latitude, longitude)) return;
  await safeCacheSet(
    cache,
    lookAroundCacheKey(latitude, longitude),
    false,
    LOOK_AROUND_CACHE_TTL_MS
  );
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
  // null = token missing or request error: don't cache, retry next open.
  // [] = the API answered and genuinely has nothing here: cache the miss so
  // no-coverage spots don't refire radius+bbox on every sheet open.
  if (!images) return null;

  await safeCacheSet(cache, cacheKey, images, MAPILLARY_CACHE_TTL_MS);
  return images.length > 0 ? toMapillaryResult(latitude, longitude, images) : null;
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

function safeCacheGetSync<T>(cache: StreetViewSyncCache, key: string): T | null {
  try {
    return cache.getSync<T>(key);
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
