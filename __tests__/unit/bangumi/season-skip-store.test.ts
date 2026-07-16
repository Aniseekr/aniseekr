import { beforeEach, describe, expect, it } from 'bun:test';
import {
  addSeasonSkip,
  clearSeasonSkips,
  loadSeasonSkipsSync,
  removeSeasonSkip,
} from '../../../libs/services/bangumi/season-skip-store';
import {
  appStorage,
  __resetAppStorageForTests,
  kvGet,
  kvSet,
} from '../../../libs/services/storage/app-storage';
import { BANGUMI_SEASON_SKIPS_STORAGE_KEY } from '../../../libs/services/storage/keys';

describe('Bangumi season skip store', () => {
  beforeEach(() => {
    appStorage.clearAll();
    __resetAppStorageForTests();
  });

  it('returns an empty set when nothing was skipped', () => {
    expect(loadSeasonSkipsSync('summer', 2026).size).toBe(0);
  });

  it('persists a skip and reads it back for the same season', () => {
    addSeasonSkip('summer', 2026, '123');
    const skips = loadSeasonSkipsSync('summer', 2026);
    expect(skips.has('123')).toBe(true);
    expect(skips.size).toBe(1);
  });

  it('scopes skips per season+year', () => {
    addSeasonSkip('summer', 2026, '123');
    expect(loadSeasonSkipsSync('spring', 2026).has('123')).toBe(false);
    expect(loadSeasonSkipsSync('summer', 2025).has('123')).toBe(false);
  });

  it('removeSeasonSkip undoes a skip (snackbar undo path)', () => {
    addSeasonSkip('summer', 2026, '123');
    removeSeasonSkip('summer', 2026, '123');
    expect(loadSeasonSkipsSync('summer', 2026).has('123')).toBe(false);
  });

  it('addSeasonSkip is idempotent', () => {
    addSeasonSkip('summer', 2026, '123');
    addSeasonSkip('summer', 2026, '123');
    expect(loadSeasonSkipsSync('summer', 2026).size).toBe(1);
  });

  it('clearSeasonSkips restores every skipped anime for that season only', () => {
    addSeasonSkip('summer', 2026, '1');
    addSeasonSkip('summer', 2026, '2');
    addSeasonSkip('fall', 2026, '3');
    clearSeasonSkips('summer', 2026);
    expect(loadSeasonSkipsSync('summer', 2026).size).toBe(0);
    expect(loadSeasonSkipsSync('fall', 2026).has('3')).toBe(true);
  });

  it('survives corrupted storage by falling back to empty', () => {
    // Simulate a bad write from an older build.
    kvSet(BANGUMI_SEASON_SKIPS_STORAGE_KEY, 'not-json');
    expect(loadSeasonSkipsSync('summer', 2026).size).toBe(0);
    // And a subsequent write recovers the blob.
    addSeasonSkip('summer', 2026, '9');
    expect(loadSeasonSkipsSync('summer', 2026).has('9')).toBe(true);
    expect(kvGet(BANGUMI_SEASON_SKIPS_STORAGE_KEY)).toContain('summer_2026');
  });
});
