// Behavioural pin for visited-spot persistence.
// - Round-trips a visited map through MMKV.
// - Drops non-`true` values so a corrupted blob can't mark spots visited.
// - The synchronous read reflects the latest save for first-frame seeding.

import { beforeEach, describe, expect, it } from 'bun:test';
import { appStorage, __resetAppStorageForTests } from '../../../libs/services/storage/app-storage';
import { VISITED_SPOTS_STORAGE_KEY } from '../../../libs/services/storage/keys';
import {
  loadVisitedSpots,
  loadVisitedSpotsSync,
  saveVisitedSpots,
  loadVisitedAtSync,
  visitedAtSync,
  checkInSpot,
  checkOutSpot,
} from '../../../libs/services/pilgrimage/visited-prefs';

beforeEach(() => {
  appStorage.clearAll();
  __resetAppStorageForTests();
});

describe('visited spots persistence', () => {
  it('returns an empty map when nothing is stored', async () => {
    expect(await loadVisitedSpots()).toEqual({});
    expect(loadVisitedSpotsSync()).toEqual({});
  });

  it('round-trips a visited map', async () => {
    await saveVisitedSpots({ spotA: true, spotB: true });
    expect(await loadVisitedSpots()).toEqual({ spotA: true, spotB: true });
  });

  it('drops values that are not strictly true', async () => {
    await saveVisitedSpots({
      good: true,
      bad: false as unknown as true,
    });
    expect(await loadVisitedSpots()).toEqual({ good: true });
  });

  it('exposes the latest save through the synchronous read', async () => {
    await saveVisitedSpots({ spotA: true });
    expect(loadVisitedSpotsSync()).toEqual({ spotA: true });
  });
});

describe('visited timestamps v2 (打卡)', () => {
  it('records an epoch-ms timestamp for a freshly-visited spot', async () => {
    const before = Date.now();
    await saveVisitedSpots({ spotA: true });
    const at = visitedAtSync('spotA');
    expect(at).not.toBeNull();
    expect(at!).toBeGreaterThanOrEqual(before);
    // boolean view still works for legacy consumers
    expect(loadVisitedSpotsSync()).toEqual({ spotA: true });
  });

  it('preserves an existing timestamp when the same spot stays visited', async () => {
    await saveVisitedSpots({ spotA: true });
    const first = visitedAtSync('spotA');
    await new Promise((r) => setTimeout(r, 2));
    await saveVisitedSpots({ spotA: true, spotB: true }); // spotA unchanged, spotB new
    expect(visitedAtSync('spotA')).toBe(first);           // NOT re-stamped
    expect(visitedAtSync('spotB')).not.toBeNull();
  });

  it('drops a spot (and its timestamp) when it is removed from the map', async () => {
    await saveVisitedSpots({ spotA: true, spotB: true });
    await saveVisitedSpots({ spotA: true }); // spotB toggled off
    expect(visitedAtSync('spotB')).toBeNull();
    expect(loadVisitedSpotsSync()).toEqual({ spotA: true });
  });

  it('lazily migrates a v1 blob: Record<spotId,true> -> timestamp 0', async () => {
    // Real v1 shape under the v1 key.
    appStorage.set(VISITED_SPOTS_STORAGE_KEY, JSON.stringify({ old1: true, old2: true }));
    expect(loadVisitedAtSync()).toEqual({ old1: 0, old2: 0 }); // 0 = "visited before we stored time"
    expect(loadVisitedSpotsSync()).toEqual({ old1: true, old2: true });
    expect(visitedAtSync('old1')).toBe(0);
  });

  it('keeps migrated 0-timestamps unless the spot is re-checked-in', async () => {
    appStorage.set(VISITED_SPOTS_STORAGE_KEY, JSON.stringify({ old1: true }));
    await saveVisitedSpots({ old1: true, new1: true }); // old1 already 0 -> stays 0; new1 stamped
    expect(visitedAtSync('old1')).toBe(0);
    expect(visitedAtSync('new1')).toBeGreaterThan(0);
  });
});

describe('atomic check-in / check-out (打卡)', () => {
  it('checkInSpot stamps the spot with the current time', async () => {
    const before = Date.now();
    await checkInSpot('spotA');
    const at = visitedAtSync('spotA');
    expect(at).not.toBeNull();
    expect(at!).toBeGreaterThanOrEqual(before);
    expect(loadVisitedSpotsSync()).toEqual({ spotA: true });
  });

  it('checkOutSpot removes the timestamp entirely', async () => {
    await checkInSpot('spotA');
    await checkOutSpot('spotA');
    expect(visitedAtSync('spotA')).toBeNull();
    expect(loadVisitedSpotsSync()).toEqual({});
  });

  it('checkInSpot on an already-stamped spot preserves the ORIGINAL stamp (no re-stamping)', async () => {
    await checkInSpot('spotA');
    const first = visitedAtSync('spotA');
    await new Promise((r) => setTimeout(r, 2));
    await checkInSpot('spotA'); // second check-in — must not move the stamp
    expect(visitedAtSync('spotA')).toBe(first);
  });

  it('checkInSpot / checkOutSpot only touch their own spot, never a stale full-map snapshot', async () => {
    await checkInSpot('spotA');
    await checkInSpot('spotB');
    const spotAAt = visitedAtSync('spotA');
    await checkOutSpot('spotB'); // must not disturb spotA's stamp
    expect(visitedAtSync('spotA')).toBe(spotAAt);
    expect(visitedAtSync('spotB')).toBeNull();
  });

  it('checkOutSpot on a spot that was never checked in is a no-op', async () => {
    await checkOutSpot('neverVisited');
    expect(loadVisitedAtSync()).toEqual({});
  });

  it('checkInSpot accepts an explicit `at` timestamp', async () => {
    await checkInSpot('spotA', 12345);
    expect(visitedAtSync('spotA')).toBe(12345);
  });
});
