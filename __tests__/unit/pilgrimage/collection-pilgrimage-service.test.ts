// Tests for CollectionPilgrimageService — verifies that anime in the user's
// collection (user_anime ∪ favorites) get translated through IDMappingService
// and surfaced as Anitabi entries, with status / favorite flags preserved.

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { LocalDB } from '../../../libs/db';
import { IDMappingService } from '../../../libs/services/sync/id-mapping-service';
import { AnitabiService } from '../../../libs/services/pilgrimage/anitabi-service';
import { CollectionPilgrimageService } from '../../../libs/services/pilgrimage/collection-pilgrimage-service';
import type { AnitabiBangumi } from '../../../libs/services/pilgrimage/types';

const sampleBangumi = (overrides: Partial<AnitabiBangumi> = {}): AnitabiBangumi => ({
  id: overrides.id ?? 1,
  cn: overrides.cn ?? '',
  title: overrides.title ?? 'Sample',
  city: overrides.city ?? '',
  cover: overrides.cover ?? '',
  color: overrides.color ?? '#FF9F0A',
  geo: overrides.geo ?? [35.0, 139.0],
  zoom: overrides.zoom ?? 12,
  modified: overrides.modified ?? 0,
  litePoints: overrides.litePoints ?? [],
  pointsLength: overrides.pointsLength ?? 1,
  imagesLength: overrides.imagesLength ?? 1,
});

interface FakeRow {
  anime_id: string;
  title?: string | null;
  status: string | null;
  is_favorite: number;
}

const buildFakeDb = (rows: FakeRow[]): typeof LocalDB => {
  const fake = {
    getAllAsync: async <T>(_sql: string) => rows as unknown as T[],
  };
  return {
    init: async () => undefined,
    getDatabase: async () => fake as never,
  } as unknown as typeof LocalDB;
};

/** Map-backed stand-in for CacheService (ignores TTL — tests only assert writes). */
const buildFakeCache = () => {
  const store = new Map<string, unknown>();
  const writes: Array<{ key: string; value: unknown; ttlMs?: number }> = [];
  return {
    store,
    writes,
    get: async <T>(key: string): Promise<T | null> => (store.get(key) as T) ?? null,
    set: async (key: string, value: unknown, ttlMs?: number) => {
      store.set(key, value);
      writes.push({ key, value, ttlMs });
    },
  };
};

describe('CollectionPilgrimageService', () => {
  let mapping: IDMappingService;
  let anitabi: AnitabiService;

  beforeEach(() => {
    mapping = IDMappingService.getInstance();
    anitabi = AnitabiService.resetForTests();
  });

  afterEach(() => {
    mock.restore();
  });

  it('returns Anitabi entries for collected anime resolved via ID mapping', async () => {
    const db = buildFakeDb([
      { anime_id: '987654321', status: 'watching', is_favorite: 0 },
      { anime_id: '99999', status: 'completed', is_favorite: 1 },
    ]);

    const mapSpy = spyOn(mapping, 'mapID').mockImplementation(
      async (_from: string, fromId: number | string) => {
        if (String(fromId) === '987654321') return 7157; // Hyouka fixture
        if (String(fromId) === '99999') return null; // unmapped
        return null;
      }
    );
    const fetchSpy = spyOn(anitabi, 'getAnimePilgrimage').mockImplementation(async (id: number) =>
      id === 7157 ? sampleBangumi({ id: 7157, title: '氷菓' }) : null
    );

    const service = new CollectionPilgrimageService({
      db,
      mappingService: mapping,
      anitabi,
      sourcePlatform: 'anilist',
    });

    const entries = await service.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].bangumiId).toBe(7157);
    expect(entries[0].status).toBe('watching');
    expect(entries[0].anime.title).toBe('氷菓');
    expect(mapSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('treats anime_id as bangumi id directly when source platform is bangumi', async () => {
    const db = buildFakeDb([{ anime_id: '7157', status: 'watching', is_favorite: 0 }]);
    const mapSpy = spyOn(mapping, 'mapID');
    spyOn(anitabi, 'getAnimePilgrimage').mockResolvedValue(
      sampleBangumi({ id: 7157, title: '氷菓' })
    );

    const service = new CollectionPilgrimageService({
      db,
      mappingService: mapping,
      anitabi,
      sourcePlatform: 'bangumi',
    });

    const entries = await service.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].bangumiId).toBe(7157);
    expect(mapSpy).not.toHaveBeenCalled();
  });

  it('merges user_anime + favorites duplicates into a single entry', async () => {
    const db = buildFakeDb([
      { anime_id: '12189', status: 'watching', is_favorite: 0 },
      { anime_id: '12189', status: null, is_favorite: 1 },
    ]);
    spyOn(mapping, 'mapID').mockResolvedValue(7157);
    spyOn(anitabi, 'getAnimePilgrimage').mockResolvedValue(
      sampleBangumi({ id: 7157, title: '氷菓' })
    );

    const service = new CollectionPilgrimageService({
      db,
      mappingService: mapping,
      anitabi,
      sourcePlatform: 'anilist',
    });

    const entries = await service.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe('watching');
    expect(entries[0].isFavorite).toBe(true);
  });

  it('drops anime that have no Anitabi entry (404 / null)', async () => {
    const db = buildFakeDb([{ anime_id: '12189', status: 'watching', is_favorite: 0 }]);
    spyOn(mapping, 'mapID').mockResolvedValue(7157);
    spyOn(anitabi, 'getAnimePilgrimage').mockResolvedValue(null);

    const service = new CollectionPilgrimageService({
      db,
      mappingService: mapping,
      anitabi,
      sourcePlatform: 'anilist',
    });

    const entries = await service.getEntries();
    expect(entries).toHaveLength(0);
  });

  it('reports stats with both matched count and total checked', async () => {
    const db = buildFakeDb([
      { anime_id: '1', status: 'watching', is_favorite: 0 },
      { anime_id: '2', status: 'completed', is_favorite: 0 },
      { anime_id: '3', status: null, is_favorite: 1 },
    ]);
    spyOn(mapping, 'mapID').mockImplementation(async (_from: string, fromId: number | string) =>
      String(fromId) === '1' ? 7157 : null
    );
    spyOn(anitabi, 'getAnimePilgrimage').mockResolvedValue(sampleBangumi({ id: 7157 }));

    const service = new CollectionPilgrimageService({
      db,
      mappingService: mapping,
      anitabi,
      sourcePlatform: 'anilist',
    });

    const stats = await service.getStats();
    expect(stats.total).toBe(3);
    expect(stats.matched).toBe(1);
  });

  it('returns empty when collection is empty', async () => {
    const db = buildFakeDb([]);
    const mapSpy = spyOn(mapping, 'mapID');
    const fetchSpy = spyOn(anitabi, 'getAnimePilgrimage');

    const service = new CollectionPilgrimageService({
      db,
      mappingService: mapping,
      anitabi,
      sourcePlatform: 'anilist',
    });

    const entries = await service.getEntries();
    expect(entries).toHaveLength(0);
    expect(mapSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ── L0 online title resolution ──────────────────────────────────────────
  // Offline snapshots (cross-index + id_mappings) lag behind newly-aired
  // anime; these tests cover the Bangumi-title-search fallback that lets a
  // freshly-added show still reach the map.
  describe('online title resolution (L0)', () => {
    const MONO_BGM_ID = 502572;

    const makeService = (overrides: {
      rows: FakeRow[];
      search?: (keyword: string) => Promise<{ data: object[] }>;
      detail?: () => Promise<{ titleJapanese?: string | null } | null>;
      cache?: ReturnType<typeof buildFakeCache>;
    }) => {
      const cache = overrides.cache ?? buildFakeCache();
      const searchCalls: string[] = [];
      const search = overrides.search ?? (async () => ({ data: [] }));
      const service = new CollectionPilgrimageService({
        db: buildFakeDb(overrides.rows),
        mappingService: mapping,
        anitabi,
        sourcePlatform: 'anilist',
        cache,
        bangumiSearch: {
          searchSubjects: async (keyword: string) => {
            searchCalls.push(keyword);
            return search(keyword) as never;
          },
        },
        fetchUnifiedDetail: overrides.detail ?? (async () => null),
      });
      return { service, cache, searchCalls };
    };

    it('resolves an unmapped anime via Bangumi title search and surfaces it', async () => {
      spyOn(mapping, 'mapID').mockResolvedValue(null);
      spyOn(anitabi, 'getAnimePilgrimage').mockImplementation(async (id: number) =>
        id === MONO_BGM_ID ? sampleBangumi({ id: MONO_BGM_ID, title: 'mono' }) : null
      );

      const { service, cache, searchCalls } = makeService({
        rows: [{ anime_id: '178825', title: 'mono', status: 'watching', is_favorite: 0 }],
        search: async () => ({
          data: [{ id: MONO_BGM_ID, type: 2, name: 'mono', name_cn: '' }],
        }),
      });

      const entries = await service.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].bangumiId).toBe(MONO_BGM_ID);
      expect(entries[0].status).toBe('watching');
      expect(searchCalls).toEqual(['mono']);
      // Verdict persisted so the next refresh skips the search.
      expect(cache.writes).toHaveLength(1);
      expect(cache.writes[0].value).toEqual({ bangumiId: MONO_BGM_ID });
    });

    it('searches with the native Japanese title first when the detail fetch provides one', async () => {
      spyOn(mapping, 'mapID').mockResolvedValue(null);
      spyOn(anitabi, 'getAnimePilgrimage').mockResolvedValue(sampleBangumi({ id: 7157 }));

      const { service, searchCalls } = makeService({
        rows: [
          // Deliberately NOT a real AniList id — must miss the bundled L2
          // cross-index so the test exercises the L0 path.
          { anime_id: '999999881', title: 'Sousou no Frieren', status: 'watching', is_favorite: 0 },
        ],
        detail: async () => ({ titleJapanese: '葬送のフリーレン' }),
        search: async (keyword) => ({
          data:
            keyword === '葬送のフリーレン'
              ? [{ id: 7157, type: 2, name: '葬送のフリーレン', name_cn: '葬送的芙莉莲' }]
              : [],
        }),
      });

      const entries = await service.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].bangumiId).toBe(7157);
      expect(searchCalls[0]).toBe('葬送のフリーレン');
    });

    it('rejects candidates whose titles only partially match (no fuzzy fallback)', async () => {
      spyOn(mapping, 'mapID').mockResolvedValue(null);
      const fetchSpy = spyOn(anitabi, 'getAnimePilgrimage');

      const { service, cache } = makeService({
        rows: [{ anime_id: '1', title: 'ゆるキャン△', status: 'watching', is_favorite: 0 }],
        search: async () => ({
          data: [{ id: 999, type: 2, name: 'ゆるキャン△ SEASON2', name_cn: '' }],
        }),
      });

      const entries = await service.getEntries();
      expect(entries).toHaveLength(0);
      expect(fetchSpy).not.toHaveBeenCalled();
      // Miss is cached (shorter TTL) so refreshes don't re-search.
      expect(cache.writes).toHaveLength(1);
      expect(cache.writes[0].value).toEqual({ bangumiId: null });
    });

    it('short-circuits on a cached hit without searching', async () => {
      spyOn(mapping, 'mapID').mockResolvedValue(null);
      spyOn(anitabi, 'getAnimePilgrimage').mockResolvedValue(
        sampleBangumi({ id: MONO_BGM_ID, title: 'mono' })
      );

      const cache = buildFakeCache();
      cache.store.set('pilgrimage_bgm_resolve_anilist_178825', { bangumiId: MONO_BGM_ID });
      const { service, searchCalls } = makeService({
        rows: [{ anime_id: '178825', title: 'mono', status: null, is_favorite: 1 }],
        cache,
      });

      const entries = await service.getEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0].bangumiId).toBe(MONO_BGM_ID);
      expect(searchCalls).toHaveLength(0);
    });

    it('short-circuits on a cached miss without searching', async () => {
      spyOn(mapping, 'mapID').mockResolvedValue(null);
      const fetchSpy = spyOn(anitabi, 'getAnimePilgrimage');

      const cache = buildFakeCache();
      cache.store.set('pilgrimage_bgm_resolve_anilist_178825', { bangumiId: null });
      const { service, searchCalls } = makeService({
        rows: [{ anime_id: '178825', title: 'mono', status: null, is_favorite: 1 }],
        cache,
      });

      const entries = await service.getEntries();
      expect(entries).toHaveLength(0);
      expect(searchCalls).toHaveLength(0);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('does not cache a verdict when the search fails (retries next refresh)', async () => {
      spyOn(mapping, 'mapID').mockResolvedValue(null);

      const { service, cache } = makeService({
        rows: [{ anime_id: '178825', title: 'mono', status: 'watching', is_favorite: 0 }],
        search: async () => {
          throw new Error('network down');
        },
      });

      const entries = await service.getEntries();
      expect(entries).toHaveLength(0);
      expect(cache.writes).toHaveLength(0);
    });

    it('skips online resolution entirely for rows without a stored title', async () => {
      spyOn(mapping, 'mapID').mockResolvedValue(null);

      const { service, searchCalls } = makeService({
        rows: [{ anime_id: '178825', status: 'watching', is_favorite: 0 }],
      });

      const entries = await service.getEntries();
      expect(entries).toHaveLength(0);
      expect(searchCalls).toHaveLength(0);
    });
  });
});
