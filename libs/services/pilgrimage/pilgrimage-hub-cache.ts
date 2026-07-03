import { CacheService } from '../cache-service';
import type { LatLng } from './location-service';
import type { AnitabiBangumi } from './types';
import type { VisitedMap } from './visited-prefs';

const PILGRIMAGE_HUB_SNAPSHOT_TTL_MS = 5 * 60 * 1000;

const PILGRIMAGE_HUB_CACHE_KEY = 'pilgrimage_hub_snapshot_v1';
// 24h — a stale hub is fine (collection/location rarely change hour-to-hour);
// it only needs to survive an app restart so the user's own anime + last fix
// paint immediately instead of falling back to the bundled offline seed.
const PERSIST_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PERSIST_DEBOUNCE_MS = 800;

interface HubCacheAdapter {
  set: (key: string, value: unknown, ttlMs: number) => unknown;
  getSyncWithMeta: <T>(key: string, graceMs: number) => { value: T } | null;
  getWithMeta: <T>(key: string, graceMs: number) => Promise<{ value: T } | null>;
}

const defaultCache: HubCacheAdapter = {
  set: (key, value, ttlMs) => CacheService.set(key, value, ttlMs),
  getSyncWithMeta: (key, graceMs) => CacheService.getSyncWithMeta(key, graceMs),
  getWithMeta: (key, graceMs) => CacheService.getWithMeta(key, graceMs),
};

export interface PilgrimageHubSnapshot {
  collectionAnimes?: AnitabiBangumi[];
  featuredAnimes?: AnitabiBangumi[];
  visited?: VisitedMap;
  userLocation?: LatLng | null;
  userLocationUpdatedAt?: number;
  mapViewport?: PilgrimageHubMapViewport | null;
  updatedAt: number;
}

export interface PilgrimageHubMapViewport {
  center: { lat: number; lng: number };
  zoom: number;
}

type SnapshotPatch = Partial<Omit<PilgrimageHubSnapshot, 'updatedAt'>>;

let snapshot: PilgrimageHubSnapshot | null = null;
let now = () => Date.now();
let cache: HubCacheAdapter = defaultCache;
let persistDebounceMs = DEFAULT_PERSIST_DEBOUNCE_MS;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

export function getPilgrimageHubSnapshot(
  maxAgeMs: number = PILGRIMAGE_HUB_SNAPSHOT_TTL_MS
): PilgrimageHubSnapshot | null {
  if (!snapshot) {
    // Warm-mirror fast path: within the same session (or after _layout's
    // async hydrate primed CacheService's in-memory mirror), the persisted
    // snapshot is readable synchronously — Rule 10 frame-1 seed.
    const meta = cache.getSyncWithMeta<PilgrimageHubSnapshot>(
      PILGRIMAGE_HUB_CACHE_KEY,
      PERSIST_TTL_MS
    );
    if (meta) snapshot = normalizePersisted(meta.value);
  }
  if (!snapshot) return null;
  if (maxAgeMs >= 0 && now() - snapshot.updatedAt > maxAgeMs) return null;
  return cloneSnapshot(snapshot);
}

export function updatePilgrimageHubSnapshot(patch: SnapshotPatch): void {
  const base = snapshot ? cloneSnapshot(snapshot) : { updatedAt: now() };

  if (Object.prototype.hasOwnProperty.call(patch, 'collectionAnimes')) {
    base.collectionAnimes = [...(patch.collectionAnimes ?? [])];
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'featuredAnimes')) {
    base.featuredAnimes = [...(patch.featuredAnimes ?? [])];
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'visited')) {
    base.visited = { ...(patch.visited ?? {}) };
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'userLocation')) {
    base.userLocation = patch.userLocation ? { ...patch.userLocation } : null;
    base.userLocationUpdatedAt = now();
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'mapViewport')) {
    base.mapViewport = patch.mapViewport ? cloneViewport(patch.mapViewport) : null;
  }

  base.updatedAt = now();
  snapshot = base;
  schedulePersist();
}

function schedulePersist(): void {
  if (persistTimer !== null) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (snapshot) cache.set(PILGRIMAGE_HUB_CACHE_KEY, snapshot, PERSIST_TTL_MS);
  }, persistDebounceMs);
}

/**
 * Async seed of the module snapshot from persisted SQLite. Called from the
 * pilgrimage _layout on mount so the module snapshot is warm before the hub /
 * map screen reads it synchronously. No-op once a snapshot exists this session
 * (never clobbers live data).
 */
export async function hydratePilgrimageHubSnapshotFromCache(): Promise<PilgrimageHubSnapshot | null> {
  if (snapshot) return cloneSnapshot(snapshot);
  try {
    const meta = await cache.getWithMeta<PilgrimageHubSnapshot>(
      PILGRIMAGE_HUB_CACHE_KEY,
      PERSIST_TTL_MS
    );
    if (meta && !snapshot) snapshot = normalizePersisted(meta.value);
  } catch {
    // best-effort — a cold hub just falls back to the bundled offline seed
  }
  return snapshot ? cloneSnapshot(snapshot) : null;
}

// Persisted JSON has no methods and may be from an older shape — pass it
// through cloneSnapshot so only known slices survive and updatedAt is sane.
function normalizePersisted(raw: PilgrimageHubSnapshot): PilgrimageHubSnapshot {
  return cloneSnapshot({ ...raw, updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now() });
}

export function __resetPilgrimageHubCacheForTests(
  arg:
    | (() => number)
    | { now?: () => number; cache?: HubCacheAdapter; debounceMs?: number } = () => Date.now()
): void {
  snapshot = null;
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (typeof arg === 'function') {
    now = arg;
    cache = defaultCache;
    persistDebounceMs = DEFAULT_PERSIST_DEBOUNCE_MS;
    return;
  }
  now = arg.now ?? (() => Date.now());
  cache = arg.cache ?? defaultCache;
  persistDebounceMs = arg.debounceMs ?? DEFAULT_PERSIST_DEBOUNCE_MS;
}

function cloneSnapshot(source: PilgrimageHubSnapshot): PilgrimageHubSnapshot {
  const copy: PilgrimageHubSnapshot = { updatedAt: source.updatedAt };
  if (Object.prototype.hasOwnProperty.call(source, 'collectionAnimes')) {
    copy.collectionAnimes = [...(source.collectionAnimes ?? [])];
  }
  if (Object.prototype.hasOwnProperty.call(source, 'featuredAnimes')) {
    copy.featuredAnimes = [...(source.featuredAnimes ?? [])];
  }
  if (Object.prototype.hasOwnProperty.call(source, 'visited')) {
    copy.visited = { ...(source.visited ?? {}) };
  }
  if (Object.prototype.hasOwnProperty.call(source, 'userLocation')) {
    copy.userLocation = source.userLocation ? { ...source.userLocation } : null;
  }
  if (Object.prototype.hasOwnProperty.call(source, 'userLocationUpdatedAt')) {
    copy.userLocationUpdatedAt = source.userLocationUpdatedAt;
  }
  if (Object.prototype.hasOwnProperty.call(source, 'mapViewport')) {
    copy.mapViewport = source.mapViewport ? cloneViewport(source.mapViewport) : null;
  }
  return copy;
}

function cloneViewport(source: PilgrimageHubMapViewport): PilgrimageHubMapViewport {
  return {
    center: { ...source.center },
    zoom: source.zoom,
  };
}
