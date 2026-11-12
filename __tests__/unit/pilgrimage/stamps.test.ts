import { describe, expect, it } from 'bun:test';
import { isOnsite, photoProvesSpot, spotsOnsite } from '../../../libs/services/pilgrimage/stamp-grade';
import {
  applyCheckIn,
  buildStamps,
  mergeStampRecords,
  sanitizeStampDetails,
} from '../../../libs/services/pilgrimage/stamp-details';
import {
  buildFootprint,
  PREFECTURE_GRID,
  PREFECTURE_TILES,
} from '../../../libs/services/pilgrimage/footprint';
import { atlasSpotShardOf } from '../../../libs/services/pilgrimage/atlas/atlas-client';
import {
  resolveStampMeta,
  stampsNeedingMeta,
} from '../../../libs/services/pilgrimage/stamp-backfill';

const NOW = 1_794_500_000_000;
// 花里跨線橋 (Hyouka EP20) and a point ~60 m north of it.
const bridge = { id: 'a', lat: 36.1336, lon: 137.2593, precision: 'exact' };
const near = { latitude: 36.13414, longitude: 137.2593, accuracy: 12, at: NOW - 30_000 };

describe('spot stamps', () => {
  it('PILG-115 on-site needs a recent, accurate fix inside the spot radius', () => {
    expect(isOnsite(bridge, near, NOW)).toBe(true);
    // ~170 m away: outside a point spot, inside an area spot.
    const far = { ...near, latitude: 36.13513 };
    expect(isOnsite(bridge, far, NOW)).toBe(false);
    expect(isOnsite({ ...bridge, precision: 'area' }, far, NOW)).toBe(true);
    expect(isOnsite(bridge, { ...near, at: NOW - 6 * 60_000 }, NOW)).toBe(false);
    expect(isOnsite(bridge, { ...near, accuracy: 800 }, NOW)).toBe(false);
    expect(isOnsite(bridge, null, NOW)).toBe(false);
    expect(isOnsite({ id: 'x', lat: null, lon: null }, near, NOW)).toBe(false);
    // One place, several scenes: all of them are stamped together.
    const twin = { ...bridge, id: 'b' };
    const away = { id: 'c', lat: 35.0, lon: 135.0 };
    expect(spotsOnsite([bridge, twin, away], near, NOW).map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('PILG-116 an on-site proof upgrades a manual note and is never downgraded or re-dated', () => {
    const meta = { workKey: 'hyouka', name: '花里跨線橋', muniCd: '21203' };
    expect(applyCheckIn(undefined, {})).toBeUndefined();
    const manual = applyCheckIn(undefined, { meta });
    expect(manual).toEqual({ meta });
    const proven = applyCheckIn(manual, { onsiteAt: NOW, via: 'gps' });
    expect(proven).toEqual({ meta, onsiteAt: NOW, via: 'gps' });
    expect(applyCheckIn(proven, { onsiteAt: NOW + 5000, via: 'photo' })).toEqual(proven);
    expect(applyCheckIn(proven, {})).toEqual(proven);
    // A visited spot without detail is a manual note; rally stops are not spot stamps.
    const stamps = buildStamps(
      { a: 100, b: 0, 'locality:stamp-stop-role:r1': 5 },
      sanitizeStampDetails({ a: proven, b: { via: 'gps' }, orphan: proven, junk: 3 })
    );
    expect(stamps).toEqual([
      { spotId: 'a', at: 100, onsiteAt: NOW, via: 'gps', meta },
      { spotId: 'b', at: 0, onsiteAt: null, via: null, meta: null },
    ]);
  });

  it('PILG-117 restoring a backup keeps every stamp, the earlier time and the on-site proof', () => {
    const merged = mergeStampRecords(
      { visitedAt: { a: 500, b: 0, c: 300 }, details: { c: { onsiteAt: 300, via: 'gps' } } },
      {
        visitedAt: { a: 200, b: 900, d: 700 },
        details: { a: { onsiteAt: 250, via: 'photo' }, c: { onsiteAt: 100, via: 'track' } },
      }
    );
    expect(merged.visitedAt).toEqual({ a: 200, b: 900, c: 300, d: 700 });
    expect(merged.details).toEqual({
      a: { onsiteAt: 250, via: 'photo' },
      c: { onsiteAt: 100, via: 'track' },
    });
  });

  it('PILG-118 old check-ins get their spot snapshot from Atlas and unknown ones stay unknown', async () => {
    const details = { done: { meta: { workKey: 'w', name: 'n', muniCd: '13101' } } };
    const ids = stampsNeedingMeta(
      { done: 1, old: 2, gone: 3, 'locality:stamp-stop-role:r': 4 },
      details
    );
    expect(ids).toEqual(['old', 'gone']);
    const metas = await resolveStampMeta(ids, details, {
      spotShard: async (shard) => {
        if (shard !== atlasSpotShardOf('old')) throw new Error('offline');
        return { rows: { old: ['old', 'hyouka', '花里跨線橋', 36.13, 137.25, 'c', [20]] } };
      },
      work: async (key) =>
        key === 'hyouka'
          ? ({
              spots: [{ id: 'old', location: { lat: 36.13, lon: 137.25, muniCd: '21203' } }],
            } as never)
          : null,
    });
    expect(metas).toEqual({
      old: { workKey: 'hyouka', name: '花里跨線橋', lat: 36.13, lon: 137.25, muniCd: '21203' },
    });
  });

  it('PILG-119 a photo proves a spot only with its own coordinates near the spot', () => {
    const spotGeo: [number, number] = [36.1336, 137.2593];
    const at = { latitude: 36.1345, longitude: 137.2593 }; // ~100 m
    expect(photoProvesSpot({ spotGeo, userLocation: at })).toBe(true);
    expect(photoProvesSpot({ spotGeo, userLocation: { latitude: 35.68, longitude: 139.76 } })).toBe(false);
    expect(photoProvesSpot({ spotGeo })).toBe(false);
    expect(photoProvesSpot({ userLocation: at })).toBe(false);
    expect(photoProvesSpot({ spotGeo, userLocation: at, legacy: true })).toBe(false);
  });

  it('PILG-120 the footprint groups stamps by prefecture and city and never guesses a place', () => {
    const stamp = (spotId: string, workKey: string, muniCd?: string, onsiteAt: number | null = null) => ({
      spotId,
      at: 1,
      onsiteAt,
      via: null,
      meta: { workKey, name: spotId, ...(muniCd ? { muniCd } : {}) },
    });
    const footprint = buildFootprint([
      stamp('a', 'hyouka', '21203', NOW),
      stamp('b', 'hyouka', '21203'),
      stamp('c', 'hyouka', '22213'),
      stamp('d', 'other', '21203'),
      stamp('e', 'hyouka'), // municipality unknown
      stamp('f', 'hyouka', '99999'), // not a prefecture
      { spotId: 'g', at: 1, onsiteAt: null, via: null, meta: null },
    ]);
    expect(footprint.cityCount).toBe(2);
    expect(footprint.unplaced).toBe(3);
    expect(footprint.prefectures).toEqual([
      {
        code: '21',
        spots: 3,
        onsite: 1,
        places: [
          { muniCd: '21203', workKey: 'hyouka', spots: 2, onsite: 1 },
          { muniCd: '21203', workKey: 'other', spots: 1, onsite: 0 },
        ],
      },
      { code: '22', spots: 1, onsite: 0, places: [{ muniCd: '22213', workKey: 'hyouka', spots: 1, onsite: 0 }] },
    ]);
    // The tile grid holds each of the 47 prefectures once, on its own square, inside the grid.
    expect(new Set(PREFECTURE_TILES.map((t) => t.code)).size).toBe(47);
    expect(new Set(PREFECTURE_TILES.map((t) => `${t.x},${t.y}`)).size).toBe(47);
    expect(PREFECTURE_TILES.every((t) => t.x < PREFECTURE_GRID.columns && t.y < PREFECTURE_GRID.rows)).toBe(true);
  });
});
