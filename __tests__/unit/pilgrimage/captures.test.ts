// Behavioural pin for the pilgrimage capture index (v2).
// - record appends multiple captures per spot (newest-first), not "latest only".
// - free captures live in their own bucket.
// - loadCapturesSync stays a latest-per-spot view (backwards-compat).
// - a v1 blob is lazily migrated: single capture -> length-1 array, free empty.

import { beforeEach, describe, expect, it } from 'bun:test';
import { appStorage, __resetAppStorageForTests } from '../../../libs/services/storage/app-storage';
import { CAPTURES_STORAGE_KEY, CAPTURES_STORAGE_KEY_V2 } from '../../../libs/services/storage/keys';
import {
  clearCapture,
  findCaptureByUri,
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

function capture(
  spotId: string,
  uri = `file:///${spotId}.jpg`,
  capturedAt = 1_700_000_000_000
): PilgrimageCapture {
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
    expect(v2).toEqual({
      spots: { shrine: [capture('shrine', 'file:///legacy.jpg', 42)] },
      free: [],
    });
    expect((await getCapture('shrine'))?.uri).toBe('file:///legacy.jpg');
    // First write persists v2 and does not lose the migrated capture.
    await recordCapture(capture('shrine', 'file:///new.jpg', 43));
    expect(loadCapturesV2Sync().spots.shrine.map((c) => c.uri)).toEqual([
      'file:///new.jpg',
      'file:///legacy.jpg',
    ]);
  });

  it('migrates pre-existing v1 data on write, then prefers v2 over a stale v1 blob', async () => {
    appStorage.set(
      CAPTURES_STORAGE_KEY,
      JSON.stringify({ spots: { shrine: capture('shrine', 'file:///v1.jpg', 1) } })
    );
    // recordCapture lazily migrates the v1 blob before appending — the pre-existing
    // 'shrine' capture must not be silently dropped (that's the bug this task fixes).
    await recordCapture(capture('tower', 'file:///v2.jpg', 2));
    __resetCapturesCacheForTests();
    expect(Object.keys(loadCapturesV2Sync().spots).sort()).toEqual(['shrine', 'tower']);
    // Once v2 has been persisted, later reads ignore the v1 blob even if it changes underneath.
    appStorage.set(
      CAPTURES_STORAGE_KEY,
      JSON.stringify({ spots: { other: capture('other', 'file:///other.jpg', 9) } })
    );
    __resetCapturesCacheForTests();
    expect(Object.keys(loadCapturesV2Sync().spots).sort()).toEqual(['shrine', 'tower']);
  });
});

describe('capture upsert by uri', () => {
  it('PILG-065 re-recording the same uri updates the capture in place instead of duplicating it', async () => {
    await recordCapture(capture('shrine', 'file:///a.jpg', 1));
    await recordCapture(capture('shrine', 'file:///b.jpg', 2));
    // Preview re-saves the same shot (frame score arrives later, note edited).
    await recordCapture({ ...capture('shrine', 'file:///a.jpg', 1), note: 'sunset' });
    const shots = loadCapturesV2Sync().spots.shrine;
    expect(shots.map((c) => c.uri)).toEqual(['file:///b.jpg', 'file:///a.jpg']);
    expect(shots[1].note).toBe('sunset');
  });

  it('PILG-065 moving a shot to another spot or out of the free bucket leaves exactly one record', async () => {
    await recordFreeCapture(capture('free-1', 'file:///shot.jpg', 5));
    await recordCapture(capture('shrine', 'file:///shot.jpg', 5));
    let idx = loadCapturesV2Sync();
    expect(idx.free).toEqual([]);
    expect(idx.spots.shrine.map((c) => c.uri)).toEqual(['file:///shot.jpg']);

    // Swapping the reference scene re-files the shot under the new spot.
    await recordCapture(capture('tower', 'file:///shot.jpg', 5));
    idx = loadCapturesV2Sync();
    expect(idx.spots.shrine).toBeUndefined();
    expect(idx.spots.tower.map((c) => c.uri)).toEqual(['file:///shot.jpg']);
    expect(loadAllCapturesSync()).toHaveLength(1);
  });

  it('PILG-065 re-recording a free capture (e.g. attaching a reference) keeps one free record', async () => {
    await recordFreeCapture(capture('free-1', 'file:///shot.jpg', 5));
    await recordFreeCapture({
      ...capture('free-1', 'file:///shot.jpg', 5),
      referenceUri: 'file:///ref.jpg',
    });
    const { free } = loadCapturesV2Sync();
    expect(free).toHaveLength(1);
    expect(free[0].referenceUri).toBe('file:///ref.jpg');
  });
});

describe('capture re-save merges', () => {
  const snapshot = { distanceMeters: 12, headingDeltaDeg: -8, tilt: 3, frameMatch: 0.72 };

  function full(spotId = 'shrine'): PilgrimageCapture {
    return {
      ...capture(spotId, 'file:///shot.jpg', 5),
      heading: 90,
      sensorSnapshot: snapshot,
      compositeUri: 'file:///composite.png',
      userLocation: { latitude: 35, longitude: 139 },
      note: 'sunset',
      source: 'auto',
      animeId: 1,
      animeTitle: 'A',
      spotName: '駅',
      spotImage: 'https://image.anitabi.cn/p.jpg',
    };
  }

  it('PILG-070 re-saving with fewer fields keeps what the writer did not supply', async () => {
    await recordCapture(full());
    // A preview opened from the Journal knows the uri and note, not the rest.
    await recordCapture({ ...capture('shrine', 'file:///shot.jpg', 5), note: 'golden hour' });
    const [shot] = loadCapturesV2Sync().spots.shrine;
    expect(shot).toEqual({ ...full(), note: 'golden hour' });
  });

  it('PILG-070 an empty note clears the stored note', async () => {
    await recordCapture(full());
    await recordCapture({ ...capture('shrine', 'file:///shot.jpg', 5), note: '' });
    const [shot] = loadCapturesV2Sync().spots.shrine;
    expect('note' in shot).toBe(false);
    expect(shot.sensorSnapshot).toEqual(snapshot);
  });

  it('PILG-070 re-saving a free capture against the same imported reference merges too', async () => {
    await recordFreeCapture({ ...full('free-1'), referenceUri: 'file:///ref.jpg' });
    await recordFreeCapture({ ...capture('free-1', 'file:///shot.jpg', 5), note: 'x' });
    const [shot] = loadCapturesV2Sync().free;
    expect(shot.referenceUri).toBe('file:///ref.jpg');
    expect(shot.compositeUri).toBe('file:///composite.png');
    expect(shot.note).toBe('x');
  });
});

describe('capture re-pair carry-over', () => {
  const tiltOnly = { distanceMeters: null, headingDeltaDeg: null, tilt: 3 };

  function fromSpot(): PilgrimageCapture {
    return {
      ...capture('shrine', 'file:///shot.jpg', 5),
      heading: 90,
      sensorSnapshot: { distanceMeters: 12, headingDeltaDeg: -8, tilt: 3, frameMatch: 0.72 },
      compositeUri: 'file:///composite.png',
      userLocation: { latitude: 35, longitude: 139 },
      note: 'sunset',
      source: 'auto',
      animeId: 1,
      animeTitle: 'A',
      spotName: '駅',
      spotImage: 'https://image.anitabi.cn/p.jpg',
      spotEp: 3,
      spotGeo: [35.1, 139.1],
    };
  }

  it('PILG-071 a shot re-paired with another scene keeps its photo fields, not the old scene', async () => {
    await recordCapture(fromSpot());
    await recordCapture({
      ...capture('tower', 'file:///shot.jpg', 5),
      animeId: 2,
      spotName: '塔',
      spotImage: 'https://image.anitabi.cn/t.jpg',
    });
    const idx = loadCapturesV2Sync();
    expect(idx.spots.shrine).toBeUndefined();
    expect(idx.spots.tower).toEqual([
      {
        ...capture('tower', 'file:///shot.jpg', 5),
        heading: 90,
        sensorSnapshot: tiltOnly,
        userLocation: { latitude: 35, longitude: 139 },
        note: 'sunset',
        source: 'auto',
        animeId: 2,
        spotName: '塔',
        spotImage: 'https://image.anitabi.cn/t.jpg',
      },
    ]);
  });

  it('PILG-071 a scene shot moved to an imported reference drops every scene field', async () => {
    await recordCapture(fromSpot());
    await recordFreeCapture({
      ...capture('ref-9-1', 'file:///shot.jpg', 5),
      referenceUri: 'file:///ref.jpg',
    });
    const idx = loadCapturesV2Sync();
    expect(idx.spots).toEqual({});
    expect(idx.free).toEqual([
      {
        ...capture('ref-9-1', 'file:///shot.jpg', 5),
        heading: 90,
        sensorSnapshot: tiltOnly,
        userLocation: { latitude: 35, longitude: 139 },
        note: 'sunset',
        source: 'auto',
        referenceUri: 'file:///ref.jpg',
      },
    ]);
  });

  it('PILG-071 swapping one imported reference for another drops the old comparison', async () => {
    await recordFreeCapture({
      ...capture('ref-1-1', 'file:///shot.jpg', 5),
      referenceUri: 'file:///old.jpg',
      compositeUri: 'file:///old-composite.png',
      sensorSnapshot: { distanceMeters: null, headingDeltaDeg: null, tilt: 3, frameMatch: 0.4 },
    });
    await recordFreeCapture(capture('free-2', 'file:///other.jpg', 9));
    await recordFreeCapture({
      ...capture('ref-2-2', 'file:///shot.jpg', 5),
      referenceUri: 'file:///new.jpg',
    });
    const { free } = loadCapturesV2Sync();
    expect(free.map((c) => c.uri)).toEqual(['file:///other.jpg', 'file:///shot.jpg']);
    expect(free[1]).toEqual({
      ...capture('ref-2-2', 'file:///shot.jpg', 5),
      referenceUri: 'file:///new.jpg',
      sensorSnapshot: tiltOnly,
    });
  });
});

describe('legacy duplicate captures', () => {
  it('PILG-072 a uri stored more than once in one list reads back as its newest record', () => {
    appStorage.set(
      CAPTURES_STORAGE_KEY_V2,
      JSON.stringify({
        spots: {
          shrine: [
            { ...capture('shrine', 'file:///a.jpg', 3), note: 'newest' },
            capture('shrine', 'file:///b.jpg', 2),
            { ...capture('shrine', 'file:///a.jpg', 3), note: 'older' },
          ],
        },
        free: [capture('free-1', 'file:///f.jpg', 1), capture('free-1', 'file:///f.jpg', 1)],
      })
    );
    const idx = loadCapturesV2Sync();
    expect(idx.spots.shrine.map((c) => c.note ?? c.uri)).toEqual(['newest', 'file:///b.jpg']);
    expect(idx.free).toHaveLength(1);
  });
});

describe('sensor snapshot merge', () => {
  it('PILG-070 a re-save without frame fields keeps the stored frame match', async () => {
    await recordCapture({
      ...capture('shrine', 'file:///shot.jpg', 5),
      sensorSnapshot: { distanceMeters: 12, headingDeltaDeg: -8, tilt: 3, frameMatch: 0.72 },
    });
    await recordCapture({
      ...capture('shrine', 'file:///shot.jpg', 5),
      note: 'edited offline',
      sensorSnapshot: { distanceMeters: 12, headingDeltaDeg: -8, tilt: 3 },
    });
    const [shot] = loadCapturesV2Sync().spots.shrine;
    expect(shot.sensorSnapshot).toEqual({
      distanceMeters: 12,
      headingDeltaDeg: -8,
      tilt: 3,
      frameMatch: 0.72,
    });
    expect(findCaptureByUri('file:///shot.jpg')?.note).toBe('edited offline');
    expect(findCaptureByUri('file:///missing.jpg')).toBeNull();
  });
});
