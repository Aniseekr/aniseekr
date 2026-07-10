import { beforeEach, describe, expect, it } from 'bun:test';
import {
  sortFolderItems,
  filterFolderItems,
  loadFolderSortModeSync,
  saveFolderSortMode,
  type SortableFolderItem,
} from '../../libs/services/collection/folder-sort';
import {
  appStorage,
  __resetAppStorageForTests,
  kvSet,
} from '../../libs/services/storage/app-storage';
import { COLLECTION_FOLDER_SORT_MODE_STORAGE_KEY } from '../../libs/services/storage/keys';

type Row = SortableFolderItem & { id: string };
const rows: Row[] = [
  { id: 'a', title: 'Bocchi the Rock!', score: 90, updated_at: null }, // updated_at missing → sorts last
  { id: 'b', title: 'Aria', score: 70, updated_at: 300 },
  { id: 'c', title: 'Cowboy Bebop', score: 100, updated_at: 200 },
];

describe('sortFolderItems', () => {
  it('added keeps input order', () => {
    expect(sortFolderItems(rows, 'added').map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('updated sorts by updated_at desc, nulls last', () => {
    expect(sortFolderItems(rows, 'updated').map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });
  it('title sorts alphabetically', () => {
    expect(sortFolderItems(rows, 'title').map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });
  it('rating sorts by score desc', () => {
    expect(sortFolderItems(rows, 'rating').map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });
  it('does not mutate the input array', () => {
    const input: Row[] = [...rows];
    sortFolderItems(input, 'title');
    expect(input.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('filterFolderItems', () => {
  it('matches title case-insensitively', () => {
    expect(filterFolderItems(rows, 'bOcChI').map((r) => r.id)).toEqual(['a']);
  });
  it('blank query returns all', () => {
    expect(filterFolderItems(rows, '   ').map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('folder sort persistence', () => {
  beforeEach(() => {
    appStorage.clearAll();
    __resetAppStorageForTests();
  });
  it('defaults to added when unset', () => {
    expect(loadFolderSortModeSync()).toBe('added');
  });
  it('round-trips a saved mode', () => {
    saveFolderSortMode('rating');
    expect(loadFolderSortModeSync()).toBe('rating');
  });
  it('falls back to added for a stale/invalid value', () => {
    kvSet(COLLECTION_FOLDER_SORT_MODE_STORAGE_KEY, 'popularity');
    expect(loadFolderSortModeSync()).toBe('added');
  });
});
