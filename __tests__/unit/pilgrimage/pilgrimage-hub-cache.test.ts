import { beforeEach, describe, expect, it, test } from 'bun:test';

import {
  __resetPilgrimageHubCacheForTests,
  getPilgrimageHubSnapshot,
  hydratePilgrimageHubSnapshotFromCache,
  updatePilgrimageHubSnapshot,
  PERSIST_TTL_MS,
} from '../../../libs/services/pilgrimage/pilgrimage-hub-cache';
import type { AnitabiBangumi } from '../../../libs/services/pilgrimage/types';
import type { VisitedMap } from '../../../libs/services/pilgrimage/visited-prefs';

const anime = (id: number): AnitabiBangumi => ({
  id,
  title: `Anime ${id}`,
  cn: '',
  city: 'Tokyo',
  cover: `https://image.anitabi.cn/bangumi/${id}.jpg?plan=h160`,
  color: '#00bcd4',
  geo: [35.68, 139.76],
  zoom: 12,
  modified: 0,
  litePoints: [],
  pointsLength: 1,
  imagesLength: 1,
});

describe('pilgrimage-hub-cache', () => {
  beforeEach(() => {
    __resetPilgrimageHubCacheForTests();
  });

  it('returns null before any snapshot is saved', () => {
    expect(getPilgrimageHubSnapshot()).toBeNull();
  });

  it('merges independently loaded slices', () => {
    updatePilgrimageHubSnapshot({ collectionAnimes: [anime(1)] });
    updatePilgrimageHubSnapshot({ featuredAnimes: [anime(2)] });

    const snapshot = getPilgrimageHubSnapshot();

    expect(snapshot?.collectionAnimes?.map((item) => item.id)).toEqual([1]);
    expect(snapshot?.featuredAnimes?.map((item) => item.id)).toEqual([2]);
  });

  it('copies mutable values when saving and reading', () => {
    const collection = [anime(1)];
    const visited: VisitedMap = { spotA: true };
    updatePilgrimageHubSnapshot({ collectionAnimes: collection, visited });
    collection.push(anime(2));
    visited.spotB = true;

    const snapshot = getPilgrimageHubSnapshot();
    snapshot?.collectionAnimes?.push(anime(3));
    if (snapshot?.visited) snapshot.visited.spotC = true;

    const next = getPilgrimageHubSnapshot();
    expect(next?.collectionAnimes?.map((item) => item.id)).toEqual([1]);
    expect(next?.visited).toEqual({ spotA: true });
  });

  it('keeps an explicit null location so denied location does not look uninitialized', () => {
    updatePilgrimageHubSnapshot({ userLocation: null });

    const snapshot = getPilgrimageHubSnapshot();

    expect(snapshot).not.toBeNull();
    expect(Object.prototype.hasOwnProperty.call(snapshot, 'userLocation')).toBe(true);
    expect(snapshot?.userLocation).toBeNull();
  });

  it('records location freshness independently from unrelated snapshot updates', () => {
    let tick = 10_000;
    __resetPilgrimageHubCacheForTests(() => tick);

    updatePilgrimageHubSnapshot({ userLocation: { latitude: 35.68, longitude: 139.76 } });
    tick = 30_000;
    updatePilgrimageHubSnapshot({ featuredAnimes: [anime(2)] });

    const snapshot = getPilgrimageHubSnapshot();
    expect(snapshot?.updatedAt).toBe(30_000);
    expect(snapshot?.userLocationUpdatedAt).toBe(10_000);
  });

  it('copies the remembered map viewport when saving and reading', () => {
    const mapViewport = { center: { lat: 36.2, lng: 138.1 }, zoom: 12.5 };
    updatePilgrimageHubSnapshot({ mapViewport });
    mapViewport.center.lat = 0;
    mapViewport.zoom = 0;

    const snapshot = getPilgrimageHubSnapshot();
    snapshot!.mapViewport!.center.lng = 0;

    expect(getPilgrimageHubSnapshot()?.mapViewport).toEqual({
      center: { lat: 36.2, lng: 138.1 },
      zoom: 12.5,
    });
  });
});

const HUB_KEY = 'pilgrimage_hub_snapshot_v1';

function makeFakeCache() {
  const store = new Map<string, { value: unknown; ts: number; ttl: number }>();
  return {
    calls: [] as Array<{ key: string; ttl: number }>,
    set: async (key: string, value: unknown, ttlMs: number) => {
      store.set(key, { value, ts: 0, ttl: ttlMs });
    },
    getSyncWithMeta: <T,>(key: string, _grace: number) => {
      const hit = store.get(key);
      return hit ? { value: hit.value as T, age: 0, isStale: false } : null;
    },
    getWithMeta: async <T,>(key: string, _grace: number) => {
      const hit = store.get(key);
      return hit ? { value: hit.value as T, age: 0, isStale: false } : null;
    },
    seed: (value: unknown) => store.set(HUB_KEY, { value, ts: 0, ttl: 0 }),
  } as const;
}

test('updatePilgrimageHubSnapshot persists the full snapshot to the cache (debounced)', async () => {
  const cache = makeFakeCache();
  __resetPilgrimageHubCacheForTests({ now: () => 1000, cache: cache as never, debounceMs: 0 });
  updatePilgrimageHubSnapshot({ userLocation: { latitude: 25, longitude: 121 } });
  await new Promise((r) => setTimeout(r, 0)); // flush the 0ms debounce
  const persisted = cache.getSyncWithMeta<{ userLocation: { latitude: number } }>(HUB_KEY, 0);
  expect(persisted?.value.userLocation.latitude).toBe(25);
});

test('getPilgrimageHubSnapshot seeds from a warm cache mirror when module snapshot is cold', () => {
  const cache = makeFakeCache();
  cache.seed({ collectionAnimes: [], userLocation: null, updatedAt: 1000 });
  __resetPilgrimageHubCacheForTests({ now: () => 1500, cache: cache as never, debounceMs: 0 });
  const snap = getPilgrimageHubSnapshot();
  expect(snap).not.toBeNull();
  expect(Object.prototype.hasOwnProperty.call(snap ?? {}, 'collectionAnimes')).toBe(true);
});

test('getPilgrimageHubSnapshot(PERSIST_TTL_MS) accepts a >5min-old persisted snapshot (stale-while-revalidate seed path)', () => {
  const cache = makeFakeCache();
  const writtenAt = 0;
  const sixMinutesLater = 6 * 60 * 1000; // older than the 5-min default, well inside the 24h persist TTL
  cache.seed({ collectionAnimes: [], userLocation: null, updatedAt: writtenAt });
  __resetPilgrimageHubCacheForTests({
    now: () => sixMinutesLater,
    cache: cache as never,
    debounceMs: 0,
  });

  // The tight 5-min default discards it...
  expect(getPilgrimageHubSnapshot()).toBeNull();

  // ...but a cold module snapshot means the 5-min miss above didn't seed
  // `snapshot`, so the seed-path call with the persist TTL still finds it.
  const seeded = getPilgrimageHubSnapshot(PERSIST_TTL_MS);
  expect(seeded).not.toBeNull();
  expect(Object.prototype.hasOwnProperty.call(seeded ?? {}, 'collectionAnimes')).toBe(true);
});

test('hydratePilgrimageHubSnapshotFromCache seeds the module snapshot from SQLite', async () => {
  const cache = makeFakeCache();
  cache.seed({ collectionAnimes: [], updatedAt: 2000 });
  __resetPilgrimageHubCacheForTests({ now: () => 2500, cache: cache as never, debounceMs: 0 });
  const out = await hydratePilgrimageHubSnapshotFromCache();
  expect(out).not.toBeNull();
  // module snapshot now non-null → sync read returns it without touching cache
  expect(getPilgrimageHubSnapshot()).not.toBeNull();
});
