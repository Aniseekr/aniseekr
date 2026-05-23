// Behavioural pin for visited-spot persistence.
// - Round-trips a visited map through MMKV.
// - Drops non-`true` values so a corrupted blob can't mark spots visited.
// - The synchronous read reflects the latest save for first-frame seeding.

import { beforeEach, describe, expect, it } from 'bun:test';
import { appStorage, __resetAppStorageForTests } from '../../../libs/services/storage/app-storage';
import {
  loadVisitedSpots,
  loadVisitedSpotsSync,
  saveVisitedSpots,
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
