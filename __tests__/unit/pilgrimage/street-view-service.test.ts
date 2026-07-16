import { describe, expect, it } from 'bun:test';
import type { MapillaryImage } from '../../../libs/services/pilgrimage/street-view/mapillary-client';
import {
  LOOK_AROUND_CACHE_TTL_MS,
  resolveStreetView,
  type LookAroundProvider,
  type StreetViewCache,
  type StreetViewMapillaryClient,
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

class MemoryStreetViewCache implements StreetViewCache {
  readonly values = new Map<string, unknown>();
  readonly sets: { key: string; value: unknown; ttlMs: number }[] = [];

  async get<T>(key: string): Promise<T | null> {
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
});
