import { beforeEach, describe, expect, it } from 'bun:test';
import {
  loadCollectionSortModeSync,
  saveCollectionSortMode,
} from '../../libs/services/collection-prefs';
import {
  appStorage,
  __resetAppStorageForTests,
  kvSet,
} from '../../libs/services/storage/app-storage';
import { COLLECTION_SORT_MODE_STORAGE_KEY } from '../../libs/services/storage/keys';

describe('collection sort-mode prefs', () => {
  beforeEach(() => {
    appStorage.clearAll();
    __resetAppStorageForTests();
  });

  it('defaults to newest when unset', () => {
    expect(loadCollectionSortModeSync()).toBe('newest');
  });

  it('round-trips a still-valid mode', async () => {
    await saveCollectionSortMode('count');
    expect(loadCollectionSortModeSync()).toBe('count');
  });

  it('falls back to newest for retired mode "rarity"', () => {
    kvSet(COLLECTION_SORT_MODE_STORAGE_KEY, 'rarity');
    expect(loadCollectionSortModeSync()).toBe('newest');
  });

  it('falls back to newest for retired mode "popularity"', () => {
    kvSet(COLLECTION_SORT_MODE_STORAGE_KEY, 'popularity');
    expect(loadCollectionSortModeSync()).toBe('newest');
  });

  it('falls back to newest for retired mode "id"', () => {
    kvSet(COLLECTION_SORT_MODE_STORAGE_KEY, 'id');
    expect(loadCollectionSortModeSync()).toBe('newest');
  });
});
