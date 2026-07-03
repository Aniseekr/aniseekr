// Behavioural pin for the pilgrimage capture index (v2).
// - record appends multiple captures per spot (newest-first), not "latest only".
// - free captures live in their own bucket.
// - loadCapturesSync stays a latest-per-spot view (backwards-compat).
// - a v1 blob is lazily migrated: single capture -> length-1 array, free empty.

import { beforeEach, describe, expect, it } from 'bun:test';
import { appStorage, __resetAppStorageForTests } from '../../../libs/services/storage/app-storage';
import { CAPTURES_STORAGE_KEY } from '../../../libs/services/storage/keys';
import {
  clearCapture,
  clearFreeCapture,
  getCapture,
  listCaptures,
  loadAllCapturesSync,
  loadCapturesSync,
  loadCapturesV2Sync,
  recordCapture,
  recordFreeCapture,
  __resetCapturesCacheForTests,
  type PilgrimageCapture,
} from '../../../libs/services/pilgrimage/captures';

function capture(spotId: string, uri = `file:///${spotId}.jpg`, capturedAt = 1_700_000_000_000): PilgrimageCapture {
  return { spotId, uri, capturedAt };
}

beforeEach(() => {
  appStorage.clearAll();
  __resetCapturesCacheForTests();
  __resetAppStorageForTests();
});

describe('pilgrimage captures v2', () => {
  it('returns an empty index when nothing is stored', async () => {
    expect(await listCaptures()).toEqual({});
    expect(loadCapturesSync()).toEqual({});
    expect(loadCapturesV2Sync()).toEqual({ spots: {}, free: [] });
    expect(loadAllCapturesSync()).toEqual([]);
  });

  it('appends multiple captures per spot, newest first', async () => {
    await recordCapture(capture('shrine', 'file:///a.jpg', 1));
    await recordCapture(capture('shrine', 'file:///b.jpg', 2));
    const v2 = loadCapturesV2Sync();
    expect(v2.spots.shrine.map((c) => c.uri)).toEqual(['file:///b.jpg', 'file:///a.jpg']);
    // Backwards-compat view keeps only the newest per spot.
    expect((await getCapture('shrine'))?.uri).toBe('file:///b.jpg');
    expect(Object.keys(loadCapturesSync())).toEqual(['shrine']);
  });

  it('stores free captures in their own bucket', async () => {
    await recordFreeCapture(capture('free-1', 'file:///f1.jpg', 5));
    await recordFreeCapture(capture('free-2', 'file:///f2.jpg', 6));
    const v2 = loadCapturesV2Sync();
    expect(v2.free.map((c) => c.uri)).toEqual(['file:///f2.jpg', 'file:///f1.jpg']);
    expect(v2.spots).toEqual({});
    // loadCapturesSync (per-spot view) does NOT surface free captures.
    expect(loadCapturesSync()).toEqual({});
    // flat loader includes both buckets.
    expect(loadAllCapturesSync().map((c) => c.uri)).toEqual(['file:///f2.jpg', 'file:///f1.jpg']);
  });

  it('clears one capture by uri, and the whole spot without a uri', async () => {
    await recordCapture(capture('shrine', 'file:///a.jpg', 1));
    await recordCapture(capture('shrine', 'file:///b.jpg', 2));
    await clearCapture('shrine', 'file:///a.jpg');
    expect(loadCapturesV2Sync().spots.shrine.map((c) => c.uri)).toEqual(['file:///b.jpg']);
    await clearCapture('shrine');
    expect(loadCapturesV2Sync().spots.shrine).toBeUndefined();
    expect(await getCapture('shrine')).toBeNull();
  });

  it('clears one free capture by uri', async () => {
    await recordFreeCapture(capture('free-1', 'file:///f1.jpg', 5));
    await recordFreeCapture(capture('free-2', 'file:///f2.jpg', 6));
    await clearFreeCapture('file:///f1.jpg');
    expect(loadCapturesV2Sync().free.map((c) => c.uri)).toEqual(['file:///f2.jpg']);
  });

  it('lazily migrates a v1 blob: single capture -> length-1 array, empty free', async () => {
    // Real v1 shape: { spots: Record<spotId, PilgrimageCapture> } under the v1 key.
    const v1 = { spots: { shrine: capture('shrine', 'file:///legacy.jpg', 42) } };
    appStorage.set(CAPTURES_STORAGE_KEY, JSON.stringify(v1));
    __resetCapturesCacheForTests();
    const v2 = loadCapturesV2Sync();
    expect(v2).toEqual({ spots: { shrine: [capture('shrine', 'file:///legacy.jpg', 42)] }, free: [] });
    expect((await getCapture('shrine'))?.uri).toBe('file:///legacy.jpg');
    // First write persists v2 and does not lose the migrated capture.
    await recordCapture(capture('shrine', 'file:///new.jpg', 43));
    expect(loadCapturesV2Sync().spots.shrine.map((c) => c.uri)).toEqual(['file:///new.jpg', 'file:///legacy.jpg']);
  });

  it('migrates pre-existing v1 data on write, then prefers v2 over a stale v1 blob', async () => {
    appStorage.set(CAPTURES_STORAGE_KEY, JSON.stringify({ spots: { shrine: capture('shrine', 'file:///v1.jpg', 1) } }));
    // recordCapture lazily migrates the v1 blob before appending — the pre-existing
    // 'shrine' capture must not be silently dropped (that's the bug this task fixes).
    await recordCapture(capture('tower', 'file:///v2.jpg', 2));
    __resetCapturesCacheForTests();
    expect(Object.keys(loadCapturesV2Sync().spots).sort()).toEqual(['shrine', 'tower']);
    // Once v2 has been persisted, later reads ignore the v1 blob even if it changes underneath.
    appStorage.set(CAPTURES_STORAGE_KEY, JSON.stringify({ spots: { other: capture('other', 'file:///other.jpg', 9) } }));
    __resetCapturesCacheForTests();
    expect(Object.keys(loadCapturesV2Sync().spots).sort()).toEqual(['shrine', 'tower']);
  });
});
