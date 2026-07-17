import { describe, expect, it } from 'bun:test';
import type { MapillaryImage } from '../../../libs/services/pilgrimage/street-view/mapillary-client';
import {
  LOOK_AROUND_CACHE_TTL_MS,
  MAPILLARY_CACHE_TTL_MS,
  markLookAroundUnavailable,
  peekStreetView,
  resolveStreetView,
  type LookAroundProvider,
  type StreetViewCache,
  type StreetViewMapillaryClient,
  type StreetViewSyncCache,
} from '../../../libs/services/pilgrimage/street-view/street-view-service';

const SAMPLE_IMAGE: MapillaryImage = {
  id: 'mapillary-1',
  thumb1024Url: 'https://images.mapillary.com/1.jpg',
  latitude: 35.65805,
  longitude: 139.70105,
  compassAngle: 90,
  isPano: true,
  qualityScore: 0.8,
  capturedAt: '2024-01-01T00:00:00Z',
  distanceMeters: 7,
};

class MemoryStreetViewCache implements StreetViewCache, StreetViewSyncCache {
  readonly values = new Map<string, unknown>();
  readonly sets: { key: string; value: unknown; ttlMs: number }[] = [];

  async get<T>(key: string): Promise<T | null> {
    return this.getSync<T>(key);
  }

  getSync<T>(key: string): T | null {
    return this.values.has(key) ? (this.values.get(key) as T) : null;
  }

  async set(key: string, value: unknown, ttlMs: number): Promise<void> {
    this.values.set(key, value);
    this.sets.push({ key, value, ttlMs });
  }
}

function lookAroundProvider(result: boolean): LookAroundProvider & { calls: number } {
  return {
    calls: 0,
    async hasScene() {
      this.calls += 1;
      return result;
    },
  };
}

function mapillaryClient(
  result: MapillaryImage[] | null
): StreetViewMapillaryClient & { calls: number } {
  return {
    calls: 0,
    async findNearbyImages() {
      this.calls += 1;
      return result;
    },
  };
}

describe('resolveStreetView', () => {
  it('PILG-020 resolves Look Around first on iOS and falls back to Mapillary', async () => {
    const iosLookAround = lookAroundProvider(true);
    const iosMapillary = mapillaryClient([SAMPLE_IMAGE]);

    const lookAround = await resolveStreetView(35.658, 139.701, {
      platform: 'ios',
      lookAroundProvider: iosLookAround,
      mapillaryClient: iosMapillary,
      cache: new MemoryStreetViewCache(),
    });

    expect(lookAround).toEqual({ kind: 'lookaround', latitude: 35.658, longitude: 139.701 });
    expect(iosLookAround.calls).toBe(1);
    expect(iosMapillary.calls).toBe(0);

    const fallbackLookAround = lookAroundProvider(false);
    const fallbackMapillary = mapillaryClient([SAMPLE_IMAGE]);
    const fallback = await resolveStreetView(35.658, 139.701, {
      platform: 'ios',
      lookAroundProvider: fallbackLookAround,
      mapillaryClient: fallbackMapillary,
      cache: new MemoryStreetViewCache(),
    });

    expect(fallback?.kind).toBe('mapillary');
    expect(fallbackLookAround.calls).toBe(1);
    expect(fallbackMapillary.calls).toBe(1);

    const androidLookAround = lookAroundProvider(true);
    const androidMapillary = mapillaryClient([SAMPLE_IMAGE]);
    const android = await resolveStreetView(35.658, 139.701, {
      platform: 'android',
      lookAroundProvider: androidLookAround,
      mapillaryClient: androidMapillary,
      cache: new MemoryStreetViewCache(),
    });

    expect(android?.kind).toBe('mapillary');
    expect(androidLookAround.calls).toBe(0);
    expect(androidMapillary.calls).toBe(1);
    expect(android).toMatchObject({
      googleMapsPanoUrl:
        'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=35.658,139.701',
    });
  });

  it('PILG-022 reuses cached Look Around availability without provider call', async () => {
    const cache = new MemoryStreetViewCache();
    const lookAround = lookAroundProvider(true);
    const mapillary = mapillaryClient([SAMPLE_IMAGE]);

    const first = await resolveStreetView(35.658012, 139.701021, {
      platform: 'ios',
      lookAroundProvider: lookAround,
      mapillaryClient: mapillary,
      cache,
    });
    const second = await resolveStreetView(35.658049, 139.701049, {
      platform: 'ios',
      lookAroundProvider: lookAround,
      mapillaryClient: mapillary,
      cache,
    });

    expect(first?.kind).toBe('lookaround');
    expect(second?.kind).toBe('lookaround');
    expect(lookAround.calls).toBe(1);
    expect(mapillary.calls).toBe(0);
    expect(cache.sets[0]).toMatchObject({
      value: true,
      ttlMs: LOOK_AROUND_CACHE_TTL_MS,
    });
  });

  it('PILG-027 caches successful empty Mapillary answers but never errors', async () => {
    const cache = new MemoryStreetViewCache();
    const emptyMapillary = mapillaryClient([]);

    const first = await resolveStreetView(35.658, 139.701, {
      platform: 'android',
      mapillaryClient: emptyMapillary,
      cache,
    });
    const second = await resolveStreetView(35.658, 139.701, {
      platform: 'android',
      mapillaryClient: emptyMapillary,
      cache,
    });

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(emptyMapillary.calls).toBe(1);
    expect(cache.sets[0]).toMatchObject({ value: [], ttlMs: MAPILLARY_CACHE_TTL_MS });

    const errorCache = new MemoryStreetViewCache();
    const failingMapillary = mapillaryClient(null);
    await resolveStreetView(35.658, 139.701, {
      platform: 'android',
      mapillaryClient: failingMapillary,
      cache: errorCache,
    });
    await resolveStreetView(35.658, 139.701, {
      platform: 'android',
      mapillaryClient: failingMapillary,
      cache: errorCache,
    });

    expect(errorCache.sets).toHaveLength(0);
    expect(failingMapillary.calls).toBe(2);
  });
});

describe('peekStreetView', () => {
  it('PILG-026 peeks cached verdicts synchronously for warm opens', async () => {
    const cache = new MemoryStreetViewCache();

    // Nothing cached: unknown — caller keeps its loading path.
    expect(peekStreetView(35.658, 139.701, { platform: 'ios', cacheSync: cache })).toBeUndefined();
    expect(
      peekStreetView(35.658, 139.701, { platform: 'android', cacheSync: cache })
    ).toBeUndefined();

    // Warm the caches through the async resolver, then peek.
    await resolveStreetView(35.658, 139.701, {
      platform: 'ios',
      lookAroundProvider: lookAroundProvider(true),
      mapillaryClient: mapillaryClient([SAMPLE_IMAGE]),
      cache,
    });
    expect(peekStreetView(35.658, 139.701, { platform: 'ios', cacheSync: cache })).toEqual({
      kind: 'lookaround',
      latitude: 35.658,
      longitude: 139.701,
    });

    const androidCache = new MemoryStreetViewCache();
    await resolveStreetView(35.658, 139.701, {
      platform: 'android',
      mapillaryClient: mapillaryClient([SAMPLE_IMAGE]),
      cache: androidCache,
    });
    const peeked = peekStreetView(35.658, 139.701, {
      platform: 'android',
      cacheSync: androidCache,
    });
    expect(peeked?.kind).toBe('mapillary');

    // Cached "known none" (lookaround false + empty mapillary) peeks as null.
    const missCache = new MemoryStreetViewCache();
    await resolveStreetView(35.658, 139.701, {
      platform: 'ios',
      lookAroundProvider: lookAroundProvider(false),
      mapillaryClient: mapillaryClient([]),
      cache: missCache,
    });
    expect(peekStreetView(35.658, 139.701, { platform: 'ios', cacheSync: missCache })).toBeNull();

    // Cached mapillary alone must not pre-empt an unknown Look Around verdict.
    const partialCache = new MemoryStreetViewCache();
    await resolveStreetView(35.658, 139.701, {
      platform: 'android',
      mapillaryClient: mapillaryClient([SAMPLE_IMAGE]),
      cache: partialCache,
    });
    expect(
      peekStreetView(35.658, 139.701, { platform: 'ios', cacheSync: partialCache })
    ).toBeUndefined();
  });
});

describe('markLookAroundUnavailable', () => {
  it('PILG-028 overwrites the cached verdict so the next resolve falls back', async () => {
    const cache = new MemoryStreetViewCache();
    const lookAround = lookAroundProvider(true);
    const mapillary = mapillaryClient([SAMPLE_IMAGE]);

    await resolveStreetView(35.658, 139.701, {
      platform: 'ios',
      lookAroundProvider: lookAround,
      mapillaryClient: mapillary,
      cache,
    });
    await markLookAroundUnavailable(35.658, 139.701, cache);

    const after = await resolveStreetView(35.658, 139.701, {
      platform: 'ios',
      lookAroundProvider: lookAround,
      mapillaryClient: mapillary,
      cache,
    });

    expect(after?.kind).toBe('mapillary');
    expect(lookAround.calls).toBe(1);
    expect(cache.sets.at(-1)?.key.startsWith('street-view:mapillary:')).toBe(true);
  });
});
