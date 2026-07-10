import { describe, expect, it, beforeEach } from 'bun:test';
import {
  pickNearestWithin,
  findNearestCachedSpot,
} from '../../../libs/services/pilgrimage/nearest-cached-spot';
import type { AnitabiPoint } from '../../../libs/services/pilgrimage/types';
import { CacheService } from '../../../libs/services/cache-service';

// Same value as anitabi-service.ts's DETAIL_CACHE_KEY_PREFIX — mirrored
// (not imported) to keep this module decoupled from the heavier service.
const DETAIL_CACHE_KEY_PREFIX = 'anitabi_points_v2_';

function pt(id: string, lat: number, lng: number): AnitabiPoint {
  return { id, name: id, image: `https://x/${id}.jpg`, ep: 0, s: 0, geo: [lat, lng] };
}

describe('pickNearestWithin', () => {
  const user = { latitude: 35.0, longitude: 139.0 };

  it('returns null when nothing is within the radius', () => {
    const far = [{ animeId: 1, spot: pt('a', 36.0, 140.0) }]; // >100km away
    expect(pickNearestWithin(far, user, 150)).toBeNull();
  });

  it('returns the closest point within the radius, with its animeId and meters', () => {
    // ~0.0009 deg lat ~= 100m; 0.0005 ~= 55m.
    const near = pt('near', 35.0005, 139.0);
    const nearer = pt('nearer', 35.0002, 139.0);
    const res = pickNearestWithin(
      [{ animeId: 7, spot: near }, { animeId: 9, spot: nearer }],
      user,
      150
    );
    expect(res).not.toBeNull();
    expect(res!.spot.id).toBe('nearer');
    expect(res!.animeId).toBe(9);
    expect(res!.distanceMeters).toBeLessThan(150);
    expect(res!.distanceMeters).toBeGreaterThan(0);
  });

  it('skips points with invalid geo', () => {
    const bad = [{ animeId: 1, spot: { ...pt('b', 0, 0), geo: [Number.NaN, 139.0] as [number, number] } }];
    expect(pickNearestWithin(bad, user, 150)).toBeNull();
  });

  it('returns null for an empty points list', () => {
    expect(pickNearestWithin([], user, 150)).toBeNull();
  });
});

describe('findNearestCachedSpot', () => {
  const user = { latitude: 35.0, longitude: 139.0 };

  beforeEach(async () => {
    await CacheService.init();
    await CacheService.clear();
  });

  it('returns null when the cache has no anitabi detail keys', async () => {
    await CacheService.set('some_other_key', { v: 1 });
    expect(await findNearestCachedSpot(user)).toBeNull();
  });

  it('scans cached detail payloads and returns the nearest spot with its animeId parsed from the key', async () => {
    const nearer = pt('nearer', 35.0002, 139.0);
    const far = pt('far', 36.0, 140.0);
    await CacheService.set(`${DETAIL_CACHE_KEY_PREFIX}42`, [nearer]);
    await CacheService.set(`${DETAIL_CACHE_KEY_PREFIX}99`, [far]);

    const res = await findNearestCachedSpot(user);
    expect(res).not.toBeNull();
    expect(res!.animeId).toBe(42);
    expect(res!.spot.id).toBe('nearer');
  });

  it('ignores non-array cache values under the detail prefix', async () => {
    await CacheService.set(`${DETAIL_CACHE_KEY_PREFIX}7`, { not: 'an-array' });
    expect(await findNearestCachedSpot(user)).toBeNull();
  });

  it('respects a custom radius', async () => {
    const near = pt('near', 35.0005, 139.0); // ~55m
    await CacheService.set(`${DETAIL_CACHE_KEY_PREFIX}5`, [near]);
    expect(await findNearestCachedSpot(user, 10)).toBeNull();
    expect(await findNearestCachedSpot(user, 150)).not.toBeNull();
  });
});
