import { beforeEach, describe, expect, it } from 'bun:test';
import { appStorage, __resetAppStorageForTests } from '../../../libs/services/storage/app-storage';
import {
  CAPTURES_STORAGE_KEY_V2,
  SPOT_INTENTS_STORAGE_KEY_V2,
  VISITED_SPOTS_STORAGE_KEY_V2,
} from '../../../libs/services/storage/keys';
import {
  LEGACY_MIGRATION_DONE_KEY,
  migrateLegacyPilgrimageRecords,
} from '../../../libs/services/pilgrimage/atlas/legacy-migration';
import { loadLegacyVisitedSpotIdsSync } from '../../../libs/services/pilgrimage/visited-prefs';
import { recordCapture } from '../../../libs/services/pilgrimage/captures';
import type {
  AtlasWorkDetail,
  AtlasWorkIndex,
} from '../../../libs/services/pilgrimage/atlas/types';

const spotId = 'atlas-spot';
const geo: [number, number] = [35, 139];
const works: AtlasWorkIndex = {
  works: [
    {
      key: 'work',
      ja: '作品',
      en: null,
      mal: [],
      bgm: [123],
      n: 1,
      conf: { c: 1, s: 0, u: 0 },
      cities: [],
    },
  ],
};
const detail: AtlasWorkDetail = {
  dataVersion: 'v1',
  franchiseKey: 'work',
  titleJa: '作品',
  bangumiIds: [123],
  spots: [
    {
      id: spotId,
      name_ja: 'Atlas名',
      address_ja: 'Atlas住所',
      note_ja: '',
      confidence: 'confirmed' as const,
      location: { lat: 35, lon: 139 },
      scenes: [{ episode: '3', time: '04:05' }],
      sources: [],
    },
  ],
};
const legacyPoint = (id = 'old-a', pointGeo = geo) => ({
  id,
  name: '舊景點',
  cn: '舊景點中文',
  image: 'https://legacy.invalid/image.jpg',
  ep: 2,
  s: 30,
  geo: pointGeo,
});

function dependencies(overrides: Record<string, unknown> = {}): any {
  const values = new Map<string, unknown>();
  const deletedPrefixes: string[] = [];
  const state = { droppedLegacyTable: false };
  return {
    values,
    deletedPrefixes,
    state,
    atlas: {
      works: async () => works,
      work: async (_key: string): Promise<AtlasWorkDetail | null> => detail,
      moved: async () => ({ moved: { 'old-a': null, 'old-b': null } }),
      spotShard: async () => ({ rows: {} }),
    },
    cache: {
      getWithMeta: async (key: string) => (values.has(key) ? values.get(key) : null),
      getEntriesByPrefix: async (prefix: string) => [...values.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, entry]) => ({ key, value: (entry as { value: unknown }).value })),
      deleteByPrefix: async (prefix: string) => {
        deletedPrefixes.push(prefix);
        for (const key of values.keys()) if (key.startsWith(prefix)) values.delete(key);
      },
    },
    legacyDb: {
      getDatabase: async () => ({
        getAllAsync: async () => [],
        execAsync: async (sql: string) => {
          if (sql.includes('DROP TABLE IF EXISTS pilgrimage_spots')) state.droppedLegacyTable = true;
        },
      }),
    },
    ...overrides,
  };
}

beforeEach(() => {
  __resetAppStorageForTests();
});

describe('Atlas legacy record migration', () => {
  it('PILG-086 postpones when a needed work file is offline and leaves the done flag unset', async () => {
    appStorage.set(
      CAPTURES_STORAGE_KEY_V2,
      JSON.stringify({
        spots: {
          'old-a': [
            {
              spotId: 'old-a',
              uri: 'file:///photo.jpg',
              capturedAt: 1,
              animeId: 123,
              spotGeo: geo,
            },
          ],
        },
        free: [],
      })
    );
    const deps = dependencies({
      atlas: {
        ...dependencies().atlas,
        work: async () => {
          throw new Error('network unavailable');
        },
      },
    });
    expect(await migrateLegacyPilgrimageRecords(deps as never)).toBe('postponed');
    expect(appStorage.getString(CAPTURES_STORAGE_KEY_V2)).toContain('old-a');
    expect(appStorage.getString(LEGACY_MIGRATION_DONE_KEY)).toBeUndefined();
  });

  it('PILG-087 preserves unmatched records as legacy and clears the old remote image', async () => {
    appStorage.set(
      CAPTURES_STORAGE_KEY_V2,
      JSON.stringify({
        spots: {
          'old-a': [
            {
              spotId: 'old-a',
              uri: 'file:///missing-photo.jpg',
              capturedAt: 1,
              animeId: 999,
              spotGeo: geo,
              spotImage: 'https://old.invalid/photo.jpg',
            },
          ],
        },
        free: [],
      })
    );
    expect(await migrateLegacyPilgrimageRecords(dependencies() as never)).toBe('migrated');
    const stored = JSON.parse(appStorage.getString(CAPTURES_STORAGE_KEY_V2)!);
    expect(stored.spots['old-a'][0]).toMatchObject({
      legacy: true,
      uri: 'file:///missing-photo.jpg',
    });
    expect(stored.spots['old-a'][0].spotImage).toBeUndefined();
  });

  it('PILG-091 preserves a record when the resolved Atlas work file is missing', async () => {
    appStorage.set(
      CAPTURES_STORAGE_KEY_V2,
      JSON.stringify({
        spots: {
          'old-a': [
            {
              spotId: 'old-a',
              uri: 'file:///photo.jpg',
              capturedAt: 1,
              animeId: 123,
              spotGeo: geo,
              spotImage: 'https://old.invalid/a',
            },
          ],
        },
        free: [],
      })
    );
    const base = dependencies();
    base.atlas.work = async () => null;
    expect(await migrateLegacyPilgrimageRecords(base as never)).toBe('migrated');
    const stored = JSON.parse(appStorage.getString(CAPTURES_STORAGE_KEY_V2)!);
    expect(stored.spots['old-a'][0]).toMatchObject({ spotId: 'old-a', legacy: true });
    expect(stored.spots['old-a'][0].spotImage).toBeUndefined();
  });

  it('PILG-088 merges captures newest-first, earliest visit, and ORed intent flags after moved null', async () => {
    const atOffset = (meters: number): [number, number] => [
      35,
      139 + meters / (111_195 * Math.cos((35 * Math.PI) / 180)),
    ];
    appStorage.set(
      CAPTURES_STORAGE_KEY_V2,
      JSON.stringify({
        spots: {
          'old-a': [
            {
              spotId: 'old-a',
              uri: 'file:///older.jpg',
              capturedAt: 10,
              animeId: 123,
              spotGeo: atOffset(49.9),
              spotImage: 'https://old.invalid/a',
            },
          ],
          'old-b': [
            {
              spotId: 'old-b',
              uri: 'file:///newer.jpg',
              capturedAt: 20,
              animeId: 123,
              spotGeo: atOffset(50),
              spotImage: 'https://old.invalid/b',
            },
          ],
        },
        free: [],
      })
    );
    appStorage.set(VISITED_SPOTS_STORAGE_KEY_V2, JSON.stringify({ 'old-a': 30, 'old-b': 10 }));
    appStorage.set(
      SPOT_INTENTS_STORAGE_KEY_V2,
      JSON.stringify({
        'old-a': { saved: true, meta: { animeId: 123, name: 'old', geo } },
        'old-b': { planned: true, meta: { animeId: 123, name: 'old', geo } },
      })
    );
    const deps = dependencies();
    deps.values.set('anitabi_points_v2_123', { value: [legacyPoint('old-a'), legacyPoint('old-b')] });
    expect(await migrateLegacyPilgrimageRecords(deps as never)).toBe('migrated');
    const captures = JSON.parse(appStorage.getString(CAPTURES_STORAGE_KEY_V2)!);
    expect(captures.spots[spotId].map((capture: { uri: string }) => capture.uri)).toEqual([
      'file:///newer.jpg',
      'file:///older.jpg',
    ]);
    expect(captures.spots[spotId][0]).toMatchObject({
      spotName: 'Atlas名',
      spotGeo: geo,
      spotEp: 3,
      spotSecond: 245,
    });
    expect(captures.spots[spotId][0].spotImage).toBeUndefined();
    expect(JSON.parse(appStorage.getString(VISITED_SPOTS_STORAGE_KEY_V2)!)[spotId]).toBe(10);
    const mergedIntent = JSON.parse(appStorage.getString(SPOT_INTENTS_STORAGE_KEY_V2)!)[spotId];
    expect(mergedIntent).toMatchObject({
      saved: true,
      planned: true,
      meta: { workKey: 'work', workTitle: '作品', spotName: 'Atlas名', geo },
    });
    expect(mergedIntent.meta.image).toBeUndefined();
    expect(mergedIntent.legacy).toBeUndefined();
  });

  it('PILG-088 keeps Atlas intent metadata when a colliding old id has no meta', async () => {
    appStorage.set(
      CAPTURES_STORAGE_KEY_V2,
      JSON.stringify({
        spots: {
          'old-a': [{ spotId: 'old-a', uri: 'file:///a.jpg', capturedAt: 1, animeId: 123, spotGeo: geo }],
          'old-b': [{ spotId: 'old-b', uri: 'file:///b.jpg', capturedAt: 2, animeId: 123, spotGeo: geo }],
        },
        free: [],
      })
    );
    appStorage.set(
      SPOT_INTENTS_STORAGE_KEY_V2,
      JSON.stringify({
        'old-a': { saved: true, meta: { workKey: 'old', workTitle: '舊作品', spotName: '舊景點', address: '舊地址' } },
        'old-b': { planned: true },
      })
    );

    expect(await migrateLegacyPilgrimageRecords(dependencies() as never)).toBe('migrated');
    const intents = JSON.parse(appStorage.getString(SPOT_INTENTS_STORAGE_KEY_V2)!);
    expect(intents[spotId]).toMatchObject({
      saved: true,
      planned: true,
      meta: {
        workKey: 'work',
        workTitle: '作品',
        spotName: 'Atlas名',
        address: 'Atlas住所',
        geo,
      },
    });
  });

  it('PILG-089 can rerun after one store write failed without losing records or photos', async () => {
    appStorage.set(
      CAPTURES_STORAGE_KEY_V2,
      JSON.stringify({
        spots: {
          'old-a': [
            { spotId: 'old-a', uri: 'file:///gone.jpg', capturedAt: 1, animeId: 123, spotGeo: geo },
          ],
        },
        free: [],
      })
    );
    const originalSet = appStorage.set;
    let failed = false;
    appStorage.set = (key, value) => {
      if (key === VISITED_SPOTS_STORAGE_KEY_V2 && !failed) {
        failed = true;
        throw new Error('simulated interruption');
      }
      originalSet(key, value);
    };
    const deps = dependencies();
    try {
      expect(await migrateLegacyPilgrimageRecords(deps as never)).toBe('postponed');
    } finally {
      appStorage.set = originalSet;
    }
    expect(appStorage.getString(LEGACY_MIGRATION_DONE_KEY)).toBeUndefined();
    expect(await migrateLegacyPilgrimageRecords(deps as never)).toBe('migrated');
    const captures = JSON.parse(appStorage.getString(CAPTURES_STORAGE_KEY_V2)!);
    expect(captures.spots[spotId][0].uri).toBe('file:///gone.jpg');
  });

  it('PILG-090 uses cached per-anime point coordinates for visited records and preserves misses', async () => {
    appStorage.set(VISITED_SPOTS_STORAGE_KEY_V2, JSON.stringify({ 'old-a': 90, 'old-b': 40 }));
    const deps = dependencies();
    deps.values.set('anitabi_points_v2_123', { value: [legacyPoint()] });
    deps.atlas.moved = async () => ({ moved: { 'old-a': null, 'old-b': null } });
    expect(await migrateLegacyPilgrimageRecords(deps as never)).toBe('migrated');
    const visited = JSON.parse(appStorage.getString(VISITED_SPOTS_STORAGE_KEY_V2)!);
    expect(visited[spotId]).toBe(90);
    expect(visited['old-b']).toBe(40);
    expect(loadLegacyVisitedSpotIdsSync()).toEqual(['old-b']);
    expect(deps.values.size).toBe(0);
  });

  it('PILG-093 resumes a visited-only store after its Atlas id was already written', async () => {
    appStorage.set(VISITED_SPOTS_STORAGE_KEY_V2, JSON.stringify({ 'old-a': 55 }));
    const deps = dependencies();
    deps.values.set('anitabi_points_v2_123', { value: [legacyPoint()] });
    const originalSet = appStorage.set;
    let failed = false;
    appStorage.set = (key, value) => {
      if (key === SPOT_INTENTS_STORAGE_KEY_V2 && !failed) {
        failed = true;
        throw new Error('simulated interruption after visited write');
      }
      originalSet(key, value);
    };
    try {
      expect(await migrateLegacyPilgrimageRecords(deps as never)).toBe('postponed');
    } finally {
      appStorage.set = originalSet;
    }
    expect(JSON.parse(appStorage.getString(VISITED_SPOTS_STORAGE_KEY_V2)!)[spotId]).toBe(55);
    expect(await migrateLegacyPilgrimageRecords(deps as never)).toBe('migrated');
    expect(JSON.parse(appStorage.getString(VISITED_SPOTS_STORAGE_KEY_V2)!)[spotId]).toBe(55);
    expect(loadLegacyVisitedSpotIdsSync()).toEqual([]);
  });

  it('PILG-094 preserves a capture added while Atlas work data is loading', async () => {
    appStorage.set(
      CAPTURES_STORAGE_KEY_V2,
      JSON.stringify({
        spots: {
          'old-a': [
            { spotId: 'old-a', uri: 'file:///old.jpg', capturedAt: 1, animeId: 123, spotGeo: geo },
          ],
        },
        free: [],
      })
    );
    let signalWorkStarted!: () => void;
    let releaseWork!: () => void;
    const workStarted = new Promise<void>((resolve) => (signalWorkStarted = resolve));
    const workGate = new Promise<void>((resolve) => (releaseWork = resolve));
    const deps = dependencies();
    deps.atlas.work = async () => {
      signalWorkStarted();
      await workGate;
      return detail;
    };

    const migration = migrateLegacyPilgrimageRecords(deps as never);
    await workStarted;
    await recordCapture({
      spotId: 'old-a',
      uri: 'file:///added-under-old-id-during-migration.jpg',
      capturedAt: 2,
    });
    await recordCapture({
      spotId,
      uri: 'file:///added-under-atlas-id-during-migration.jpg',
      capturedAt: 3,
    });
    releaseWork();
    expect(await migration).toBe('migrated');

    const stored = JSON.parse(appStorage.getString(CAPTURES_STORAGE_KEY_V2)!);
    expect(stored.spots[spotId].map((capture: { uri: string }) => capture.uri)).toContain(
      'file:///added-under-old-id-during-migration.jpg'
    );
    expect(stored.spots[spotId].map((capture: { uri: string }) => capture.uri)).toContain(
      'file:///added-under-atlas-id-during-migration.jpg'
    );
  });

  it('PILG-095 recognizes an Atlas spot id from its exact spot shard without a work file', async () => {
    const atlasId = '01af-c9.8';
    appStorage.set(VISITED_SPOTS_STORAGE_KEY_V2, JSON.stringify({ [atlasId]: 60 }));
    const deps = dependencies({
      atlas: {
        ...dependencies().atlas,
        spotShard: async () => ({ rows: { [atlasId]: [atlasId, 'work', 'Spot', 35, 139, 'c', [1]] } }),
      },
    });

    expect(await migrateLegacyPilgrimageRecords(deps as never)).toBe('migrated');
    expect(JSON.parse(appStorage.getString(VISITED_SPOTS_STORAGE_KEY_V2)!)[atlasId]).toBe(60);
    expect(loadLegacyVisitedSpotIdsSync()).toEqual([]);
  });

  it('PILG-096 resolves an old capture by its exact Japanese anime title when its Bangumi id misses', async () => {
    appStorage.set(
      CAPTURES_STORAGE_KEY_V2,
      JSON.stringify({
        spots: {
          'old-a': [
            {
              spotId: 'old-a',
              uri: 'file:///title-match.jpg',
              capturedAt: 1,
              animeId: 999,
              animeTitle: '作品',
              animeTitleCn: '中文作品',
              spotGeo: geo,
            },
          ],
        },
        free: [],
      })
    );

    expect(await migrateLegacyPilgrimageRecords(dependencies() as never)).toBe('migrated');
    const stored = JSON.parse(appStorage.getString(CAPTURES_STORAGE_KEY_V2)!);
    expect(stored.spots[spotId][0].spotId).toBe(spotId);
    expect(stored.spots[spotId][0].legacy).toBeUndefined();
  });

  it('PILG-098 recovers a visited point from the per-anime v2 cache', async () => {
    appStorage.set(VISITED_SPOTS_STORAGE_KEY_V2, JSON.stringify({ 'old-a': 77 }));
    const deps = dependencies();
    deps.values.set('anitabi_points_v2_123', { value: [legacyPoint()] });

    expect(await migrateLegacyPilgrimageRecords(deps as never)).toBe('migrated');
    expect(JSON.parse(appStorage.getString(VISITED_SPOTS_STORAGE_KEY_V2)!)[spotId]).toBe(77);
    expect(loadLegacyVisitedSpotIdsSync()).toEqual([]);
  });

  it('PILG-099 recovers a visited point from the orphaned SQLite pilgrimage table', async () => {
    appStorage.set(VISITED_SPOTS_STORAGE_KEY_V2, JSON.stringify({ 'old-a': 78 }));
    const deps = dependencies();
    let dropped = false;
    deps.legacyDb = {
      getDatabase: async () => ({
        getAllAsync: async (sql: string) => sql.includes('FROM pilgrimage_spots') ? [{
          bangumi_id: 123,
          title: '作品',
          title_cn: '作品中文',
          lite_points_json: JSON.stringify([legacyPoint()]),
        }] : [],
        execAsync: async (sql: string) => {
          if (sql.includes('DROP TABLE IF EXISTS pilgrimage_spots')) dropped = true;
        },
      }),
    };

    expect(await migrateLegacyPilgrimageRecords(deps as never)).toBe('migrated');
    expect(JSON.parse(appStorage.getString(VISITED_SPOTS_STORAGE_KEY_V2)!)[spotId]).toBe(78);
    expect(dropped).toBe(true);
  });

  it('PILG-100 tolerates an already missing pilgrimage_spots table', async () => {
    appStorage.set(VISITED_SPOTS_STORAGE_KEY_V2, JSON.stringify({ 'old-a': 79 }));
    const deps = dependencies();
    let queried = false;
    let dropped = false;
    deps.legacyDb = {
      getDatabase: async () => ({
        getAllAsync: async (sql: string) => {
          if (sql.includes('FROM pilgrimage_spots')) {
            queried = true;
            throw new Error('no such table: pilgrimage_spots');
          }
          return [];
        },
        execAsync: async (sql: string) => {
          if (sql.includes('DROP TABLE IF EXISTS pilgrimage_spots')) dropped = true;
        },
      }),
    };

    expect(await migrateLegacyPilgrimageRecords(deps as never)).toBe('migrated');
    expect(queried).toBe(true);
    expect(dropped).toBe(true);
    expect(JSON.parse(appStorage.getString(VISITED_SPOTS_STORAGE_KEY_V2)!)).toEqual({ 'old-a': 79 });
    expect(loadLegacyVisitedSpotIdsSync()).toEqual(['old-a']);
  });

  it('PILG-101 deletes Anitabi caches and drops the old table only after all writes succeed', async () => {
    appStorage.set(VISITED_SPOTS_STORAGE_KEY_V2, JSON.stringify({ 'old-a': 80 }));
    const deps = dependencies();
    deps.values.set('anitabi_points_v2_123', { value: [legacyPoint()] });
    deps.values.set('anitabi_detail_old-a', { value: { id: 'old-a' } });

    const originalSet = appStorage.set;
    appStorage.set = (key, value) => {
      if (key === VISITED_SPOTS_STORAGE_KEY_V2) throw new Error('simulated store write failure');
      originalSet(key, value);
    };
    try {
      expect(await migrateLegacyPilgrimageRecords(deps as never)).toBe('postponed');
    } finally {
      appStorage.set = originalSet;
    }
    expect(deps.deletedPrefixes).toEqual([]);
    expect(deps.state.droppedLegacyTable).toBe(false);

    deps.atlas.work = async () => detail;
    expect(await migrateLegacyPilgrimageRecords(deps as never)).toBe('migrated');
    expect(deps.deletedPrefixes).toEqual(['anitabi_points_v2_', 'anitabi_detail_']);
    expect(deps.values.has('anitabi_points_v2_123')).toBe(false);
    expect(deps.values.has('anitabi_detail_old-a')).toBe(false);
    expect(deps.state.droppedLegacyTable).toBe(true);
  });

  it('PILG-102 fills missing capture and intent context from the point lookup', async () => {
    appStorage.set(
      CAPTURES_STORAGE_KEY_V2,
      JSON.stringify({
        spots: {
          'old-a': [
            { spotId: 'old-a', uri: 'file:///photo.jpg', capturedAt: 1 },
          ],
        },
        free: [],
      })
    );
    appStorage.set(
      SPOT_INTENTS_STORAGE_KEY_V2,
      JSON.stringify({
        'old-a': {
          saved: true,
          meta: { workKey: 'old', workTitle: 'old work', spotName: 'Old', address: '' },
        },
      })
    );
    const deps = dependencies();
    deps.values.set('anitabi_points_v2_123', { value: [legacyPoint()] });

    expect(await migrateLegacyPilgrimageRecords(deps as never)).toBe('migrated');
    const captures = JSON.parse(appStorage.getString(CAPTURES_STORAGE_KEY_V2)!);
    expect(captures.spots[spotId][0]).toMatchObject({ spotId, spotGeo: geo });
    const intents = JSON.parse(appStorage.getString(SPOT_INTENTS_STORAGE_KEY_V2)!);
    expect(intents[spotId]).toMatchObject({ saved: true, meta: { workKey: 'work', geo } });
    expect(intents['old-a']).toBeUndefined();
  });

  it('PILG-103 recovers a visited point from the legacy anitabi_spots table', async () => {
    appStorage.set(VISITED_SPOTS_STORAGE_KEY_V2, JSON.stringify({ 'old-a': 81 }));
    const deps = dependencies();
    deps.legacyDb = {
      getDatabase: async () => ({
        getAllAsync: async (sql: string) => sql.includes('FROM anitabi_spots')
          ? [{ point_id: 'old-a', bangumi_id: 123, lat: 35, lng: 139, name: '舊景點' }]
          : [],
        execAsync: async () => undefined,
      }),
    };

    expect(await migrateLegacyPilgrimageRecords(deps as never)).toBe('migrated');
    expect(JSON.parse(appStorage.getString(VISITED_SPOTS_STORAGE_KEY_V2)!)[spotId]).toBe(81);
    expect(loadLegacyVisitedSpotIdsSync()).toEqual([]);
  });

  it('PILG-104 drops anitabi_spots only after all store writes succeed', async () => {
    appStorage.set(VISITED_SPOTS_STORAGE_KEY_V2, JSON.stringify({ 'old-a': 82 }));
    const deps = dependencies();
    const drops: string[] = [];
    deps.legacyDb = {
      getDatabase: async () => ({
        getAllAsync: async () => [],
        execAsync: async (sql: string) => {
          if (sql.includes('DROP TABLE')) drops.push(sql);
        },
      }),
    };
    const originalSet = appStorage.set;
    appStorage.set = (key, value) => {
      if (key === VISITED_SPOTS_STORAGE_KEY_V2) throw new Error('simulated store write failure');
      originalSet(key, value);
    };
    try {
      expect(await migrateLegacyPilgrimageRecords(deps as never)).toBe('postponed');
    } finally {
      appStorage.set = originalSet;
    }
    expect(drops).toEqual([]);

    expect(await migrateLegacyPilgrimageRecords(deps as never)).toBe('migrated');
    expect(drops).toContain('DROP TABLE IF EXISTS anitabi_spots');
  });

  it('PILG-105 tolerates a missing anitabi_spots table and still drops it defensively', async () => {
    appStorage.set(VISITED_SPOTS_STORAGE_KEY_V2, JSON.stringify({ 'old-a': 83 }));
    const deps = dependencies();
    let queried = false;
    const drops: string[] = [];
    deps.legacyDb = {
      getDatabase: async () => ({
        getAllAsync: async (sql: string) => {
          if (sql.includes('FROM anitabi_spots')) {
            queried = true;
            throw new Error('no such table: anitabi_spots');
          }
          return [];
        },
        execAsync: async (sql: string) => {
          if (sql.includes('DROP TABLE')) drops.push(sql);
        },
      }),
    };

    expect(await migrateLegacyPilgrimageRecords(deps as never)).toBe('migrated');
    expect(queried).toBe(true);
    expect(drops).toContain('DROP TABLE IF EXISTS anitabi_spots');
    expect(JSON.parse(appStorage.getString(VISITED_SPOTS_STORAGE_KEY_V2)!)).toEqual({ 'old-a': 83 });
    expect(loadLegacyVisitedSpotIdsSync()).toEqual(['old-a']);
  });
});
