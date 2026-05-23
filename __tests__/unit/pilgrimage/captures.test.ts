// Behavioural pin for the pilgrimage capture index.
// - record / list / get / clear round-trip through MMKV.
// - The synchronous read reflects the latest write for first-frame seeding.
// - The parsed index is memoised but a save is observed immediately.

import { beforeEach, describe, expect, it } from 'bun:test';
import { appStorage, __resetAppStorageForTests } from '../../../libs/services/storage/app-storage';
import {
  clearCapture,
  getCapture,
  listCaptures,
  loadCapturesSync,
  recordCapture,
  __resetCapturesCacheForTests,
  type PilgrimageCapture,
} from '../../../libs/services/pilgrimage/captures';

function capture(spotId: string): PilgrimageCapture {
  return { spotId, uri: `file:///${spotId}.jpg`, capturedAt: 1_700_000_000_000 };
}

beforeEach(() => {
  appStorage.clearAll();
  __resetCapturesCacheForTests();
  __resetAppStorageForTests();
});

describe('pilgrimage captures', () => {
  it('returns an empty index when nothing is stored', async () => {
    expect(await listCaptures()).toEqual({});
    expect(loadCapturesSync()).toEqual({});
  });

  it('records and lists a capture', async () => {
    await recordCapture(capture('shrine'));
    expect(Object.keys(await listCaptures())).toEqual(['shrine']);
    expect((await getCapture('shrine'))?.uri).toBe('file:///shrine.jpg');
  });

  it('keeps only the latest capture per spot', async () => {
    await recordCapture(capture('shrine'));
    await recordCapture({ ...capture('shrine'), uri: 'file:///newer.jpg' });
    expect((await getCapture('shrine'))?.uri).toBe('file:///newer.jpg');
  });

  it('clears a capture', async () => {
    await recordCapture(capture('shrine'));
    await clearCapture('shrine');
    expect(await getCapture('shrine')).toBeNull();
  });

  it('exposes a recorded capture through the synchronous read', async () => {
    await recordCapture(capture('station'));
    expect(Object.keys(loadCapturesSync())).toEqual(['station']);
  });
});
