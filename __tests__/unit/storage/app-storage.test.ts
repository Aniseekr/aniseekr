import { beforeEach, describe, expect, it } from 'bun:test';

import {
  appStorage,
  isMigrated,
  kvGet,
  kvRemove,
  kvSet,
  migrateToMMKV,
  type MigrationSource,
  __resetAppStorageForTests,
} from '../../../libs/services/storage/app-storage';
import {
  CAPTURES_STORAGE_KEY,
  MAP_THEME_STORAGE_KEY,
  SPOT_INTENTS_STORAGE_KEY,
  VISITED_SPOTS_STORAGE_KEY,
} from '../../../libs/services/storage/keys';

/** In-memory AsyncStorage stand-in for the migration source. */
function fakeSource(seed: Record<string, string> = {}): MigrationSource {
  const map = new Map(Object.entries(seed));
  return {
    getItem: async (key: string) => map.get(key) ?? null,
  };
}

function failingSource(seed: Record<string, string>, failKey: string): MigrationSource {
  const map = new Map(Object.entries(seed));
  return {
    getItem: async (key: string) => {
      if (key === failKey) throw new Error('read failed');
      return map.get(key) ?? null;
    },
  };
}

beforeEach(() => {
  appStorage.clearAll();
  __resetAppStorageForTests();
});

describe('kv sync accessors', () => {
  it('round-trips a string value', () => {
    kvSet('demo', 'hello');
    expect(kvGet('demo')).toBe('hello');
  });

  it('returns null for a missing key', () => {
    expect(kvGet('never-written')).toBeNull();
  });

  it('removes a key', () => {
    kvSet('demo', 'hello');
    kvRemove('demo');
    expect(kvGet('demo')).toBeNull();
  });
});

describe('migrateToMMKV', () => {
  it('copies a migrated key that only exists in the source', async () => {
    await migrateToMMKV(fakeSource({ [MAP_THEME_STORAGE_KEY]: 'dark' }));

    expect(kvGet(MAP_THEME_STORAGE_KEY)).toBe('dark');
  });

  it('does not overwrite a value already present in MMKV', async () => {
    kvSet(MAP_THEME_STORAGE_KEY, 'light');

    await migrateToMMKV(fakeSource({ [MAP_THEME_STORAGE_KEY]: 'dark' }));

    expect(kvGet(MAP_THEME_STORAGE_KEY)).toBe('light');
  });

  it('merges visited maps when MMKV already has a same-session write', async () => {
    kvSet(VISITED_SPOTS_STORAGE_KEY, JSON.stringify({ newSpot: true }));

    await migrateToMMKV(
      fakeSource({ [VISITED_SPOTS_STORAGE_KEY]: JSON.stringify({ oldSpot: true }) })
    );

    expect(JSON.parse(kvGet(VISITED_SPOTS_STORAGE_KEY) ?? '{}')).toEqual({
      oldSpot: true,
      newSpot: true,
    });
  });

  it('merges spot-intent maps when MMKV already has a same-session write', async () => {
    kvSet(SPOT_INTENTS_STORAGE_KEY, JSON.stringify({ newSpot: { planned: true } }));

    await migrateToMMKV(
      fakeSource({ [SPOT_INTENTS_STORAGE_KEY]: JSON.stringify({ oldSpot: { saved: true } }) })
    );

    expect(JSON.parse(kvGet(SPOT_INTENTS_STORAGE_KEY) ?? '{}')).toEqual({
      oldSpot: { saved: true },
      newSpot: { planned: true },
    });
  });

  it('merges capture indexes when MMKV already has a same-session write', async () => {
    kvSet(
      CAPTURES_STORAGE_KEY,
      JSON.stringify({ spots: { newSpot: { spotId: 'newSpot', uri: 'file:///new.jpg' } } })
    );

    await migrateToMMKV(
      fakeSource({
        [CAPTURES_STORAGE_KEY]: JSON.stringify({
          spots: { oldSpot: { spotId: 'oldSpot', uri: 'file:///old.jpg' } },
        }),
      })
    );

    expect(JSON.parse(kvGet(CAPTURES_STORAGE_KEY) ?? '{"spots":{}}')).toEqual({
      spots: {
        oldSpot: { spotId: 'oldSpot', uri: 'file:///old.jpg' },
        newSpot: { spotId: 'newSpot', uri: 'file:///new.jpg' },
      },
    });
  });

  it('ignores source keys that are not in the migration list', async () => {
    await migrateToMMKV(fakeSource({ 'some.unrelated.tier3.key': 'value' }));

    expect(kvGet('some.unrelated.tier3.key')).toBeNull();
  });

  it('sets the migrated flag and is idempotent on a second call', async () => {
    expect(isMigrated()).toBe(false);

    await migrateToMMKV(fakeSource());
    expect(isMigrated()).toBe(true);

    // A value present in the source after migration must not be re-copied.
    __resetAppStorageForTests();
    await migrateToMMKV(fakeSource({ [MAP_THEME_STORAGE_KEY]: 'dark' }));
    expect(kvGet(MAP_THEME_STORAGE_KEY)).toBeNull();
  });

  it('leaves the migration retryable when a source key read fails', async () => {
    await migrateToMMKV(failingSource({ [MAP_THEME_STORAGE_KEY]: 'dark' }, MAP_THEME_STORAGE_KEY));
    expect(isMigrated()).toBe(false);
    expect(kvGet(MAP_THEME_STORAGE_KEY)).toBeNull();

    __resetAppStorageForTests();
    await migrateToMMKV(fakeSource({ [MAP_THEME_STORAGE_KEY]: 'dark' }));
    expect(isMigrated()).toBe(true);
    expect(kvGet(MAP_THEME_STORAGE_KEY)).toBe('dark');
  });
});
