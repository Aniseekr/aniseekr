import { beforeEach, describe, expect, it } from 'bun:test';
import {
  BANGUMI_PREFS_STORAGE_KEY,
  loadBangumiPrefsSync,
  saveBangumiPrefs,
} from '../../libs/services/bangumi-prefs';
import {
  appStorage,
  __resetAppStorageForTests,
  kvGet,
  kvSet,
} from '../../libs/services/storage/app-storage';

const BASE_PREFS = {
  viewMode: 'calendar',
  baseViewMode: 'calendar',
  filterMode: 'all',
  typeFilter: 'all',
  showUnknownDays: false,
  notificationsEnabled: true,
} as const;

describe('Bangumi prefs', () => {
  beforeEach(() => {
    appStorage.clearAll();
    __resetAppStorageForTests();
  });

  it('does not restore transient cards mode as the first screen mode', () => {
    kvSet(
      BANGUMI_PREFS_STORAGE_KEY,
      JSON.stringify({
        ...BASE_PREFS,
        viewMode: 'cards',
        baseViewMode: 'list',
      })
    );

    expect(loadBangumiPrefsSync().viewMode).toBe('list');
    expect(loadBangumiPrefsSync().baseViewMode).toBe('list');
  });

  it('persists cards mode as the selected base mode instead of cards', async () => {
    await saveBangumiPrefs({
      ...BASE_PREFS,
      viewMode: 'cards',
      baseViewMode: 'list',
    });

    const stored = JSON.parse(kvGet(BANGUMI_PREFS_STORAGE_KEY) ?? '{}');
    expect(stored.viewMode).toBe('list');
    expect(stored.baseViewMode).toBe('list');
  });
});
