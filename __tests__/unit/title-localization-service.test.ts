import { describe, expect, it } from 'bun:test';
import { TitleLocalizationService } from '../../libs/services/title-localization-service';

function makeFakeCache() {
  const store = new Map<string, unknown>();
  return {
    store,
    getSync: <T,>(key: string): T | null => (store.has(key) ? (store.get(key) as T) : null),
    get: async <T,>(key: string): Promise<T | null> =>
      store.has(key) ? (store.get(key) as T) : null,
    set: async (key: string, value: unknown, _ttlMs?: number) => {
      store.set(key, value);
    },
    clearByPrefixWhereValue: async (prefix: string, valueJson: string) => {
      let removed = 0;
      for (const [k, v] of Array.from(store.entries())) {
        if (k.startsWith(prefix) && JSON.stringify(v) === valueJson) {
          store.delete(k);
          removed++;
        }
      }
      return removed;
    },
  };
}

type FakeIdMapping = {
  mapID: (
    fromPlatform: string,
    fromId: number | string,
    toPlatform: string
  ) => Promise<string | number | null>;
  getChineseTitleSource: (
    platform: string,
    id: number | string
  ) => Promise<{ nameCn: string | null; bangumiId: string | null } | null>;
  getLastUpdateTime: () => Promise<number | null>;
};

/** Mapping deps where the dataset has been imported (ready) by default. */
function makeIdMapping(overrides: Partial<FakeIdMapping> = {}): FakeIdMapping {
  return {
    mapID: async () => null,
    getChineseTitleSource: async () => null,
    getLastUpdateTime: async () => 1_700_000_000_000,
    ...overrides,
  };
}

/** ensure() is fire-and-forget; drain its queue before asserting. */
async function settle(rounds = 10) {
  for (let i = 0; i < rounds; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('TitleLocalizationService', () => {
  it('TLS-001 chinese resolves from local name_cn without any fetch', async () => {
    const cache = makeFakeCache();
    let fetchCalls = 0;
    const service = new TitleLocalizationService({
      cache,
      idMapping: makeIdMapping({
        getChineseTitleSource: async () => ({ nameCn: '進擊的巨人', bangumiId: '23686' }),
      }),
      fetchers: {
        chinese: async () => {
          fetchCalls += 1;
          return 'should not be called';
        },
      },
    });

    let notified = 0;
    service.subscribe(() => {
      notified += 1;
    });

    expect(service.getSync('chinese', 'anilist', '16498')).toBeUndefined();
    service.ensure('chinese', 'anilist', '16498');
    await settle();

    expect(service.getSync('chinese', 'anilist', '16498')).toBe('進擊的巨人');
    expect(fetchCalls).toBe(0);
    expect(notified).toBe(1);
  });

  it('TLS-002 chinese falls back to the Bangumi fetcher via bangumi_id', async () => {
    const cache = makeFakeCache();
    const fetchedWith: string[] = [];
    const service = new TitleLocalizationService({
      cache,
      idMapping: makeIdMapping({
        getChineseTitleSource: async () => ({ nameCn: null, bangumiId: '23686' }),
      }),
      fetchers: {
        chinese: async (id) => {
          fetchedWith.push(id);
          return '进击的巨人';
        },
      },
    });

    service.ensure('chinese', 'anilist', '16498');
    await settle();

    expect(fetchedWith).toEqual(['23686']);
    expect(service.getSync('chinese', 'anilist', '16498')).toBe('进击的巨人');
  });

  it('TLS-003 caches a negative result only when mapping data is ready', async () => {
    const cache = makeFakeCache();
    const service = new TitleLocalizationService({
      cache,
      idMapping: makeIdMapping(), // source null + ready
      fetchers: { chinese: async () => 'unused' },
    });

    service.ensure('chinese', 'anilist', '999999');
    await settle();

    expect(service.getSync('chinese', 'anilist', '999999')).toBeNull();
  });

  it('TLS-004 no negative cache before the first successful mapping import', async () => {
    const cache = makeFakeCache();
    let sourceCalls = 0;
    const service = new TitleLocalizationService({
      cache,
      idMapping: makeIdMapping({
        getChineseTitleSource: async () => {
          sourceCalls += 1;
          return null;
        },
        getLastUpdateTime: async () => null, // never imported
      }),
      fetchers: { chinese: async () => 'unused' },
    });

    service.ensure('chinese', 'anilist', '16498');
    await settle();

    // unknown (undefined), NOT known-absent (null) — and nothing persisted.
    expect(service.getSync('chinese', 'anilist', '16498')).toBeUndefined();
    expect(cache.store.size).toBe(0);

    // Within the backoff window the retry is suppressed.
    service.ensure('chinese', 'anilist', '16498');
    await settle();
    expect(sourceCalls).toBe(1);
  });

  it('TLS-005 russian resolves through mapID (shikimori alias) and caches the title', async () => {
    const cache = makeFakeCache();
    const service = new TitleLocalizationService({
      cache,
      idMapping: makeIdMapping({
        mapID: async (_from, _fromId, to) => (to === 'shikimori' ? '5114' : null),
      }),
      fetchers: { russian: async (id) => (id === '5114' ? 'Стальной алхимик' : null) },
    });

    service.ensure('russian', 'anilist', '5114');
    await settle();
    expect(service.getSync('russian', 'anilist', '5114')).toBe('Стальной алхимик');
  });

  it('TLS-006 cache keys use the v2 prefix (poisoned v1 entries orphaned)', async () => {
    const cache = makeFakeCache();
    const service = new TitleLocalizationService({
      cache,
      idMapping: makeIdMapping({
        getChineseTitleSource: async () => ({ nameCn: '冰菓', bangumiId: null }),
      }),
    });

    service.ensure('chinese', 'anilist', '12189');
    await settle();

    const keys = Array.from(cache.store.keys());
    expect(keys).toHaveLength(1);
    expect(keys[0]?.startsWith('title_loc_v2_')).toBe(true);
  });

  it('TLS-007 dedupes concurrent ensure calls for the same key', async () => {
    const cache = makeFakeCache();
    let sourceCalls = 0;
    const service = new TitleLocalizationService({
      cache,
      idMapping: makeIdMapping({
        getChineseTitleSource: async () => {
          sourceCalls += 1;
          await new Promise((resolve) => setTimeout(resolve, 5));
          return { nameCn: '冰菓', bangumiId: null };
        },
      }),
    });

    service.ensure('chinese', 'anilist', '12189');
    service.ensure('chinese', 'anilist', '12189');
    service.ensure('chinese', 'anilist', '12189');
    await settle(20);

    expect(sourceCalls).toBe(1);
    expect(service.getSync('chinese', 'anilist', '12189')).toBe('冰菓');
  });

  it('TLS-008 a failed fetch is not cached and backs off instead of hammering', async () => {
    const cache = makeFakeCache();
    let fetchCalls = 0;
    const service = new TitleLocalizationService({
      cache,
      idMapping: makeIdMapping({
        getChineseTitleSource: async () => ({ nameCn: null, bangumiId: '23686' }),
      }),
      fetchers: {
        chinese: async () => {
          fetchCalls += 1;
          throw new Error('network down');
        },
      },
    });

    service.ensure('chinese', 'anilist', '16498');
    await settle();
    expect(service.getSync('chinese', 'anilist', '16498')).toBeUndefined();
    expect(fetchCalls).toBe(1);

    service.ensure('chinese', 'anilist', '16498');
    await settle();
    expect(fetchCalls).toBe(1);
  });

  it('TLS-009 onMappingDataRefreshed flushes negatives, keeps hits, clears backoff, notifies', async () => {
    const cache = makeFakeCache();
    let ensureRound = 0;
    const service = new TitleLocalizationService({
      cache,
      idMapping: makeIdMapping({
        getChineseTitleSource: async () => {
          ensureRound += 1;
          // Round 1: dataset miss → negative. Round 2 (post-refresh): hit.
          return ensureRound === 1 ? null : { nameCn: '葬送的芙莉蓮', bangumiId: null };
        },
      }),
    });

    service.ensure('chinese', 'anilist', '154587');
    await settle();
    expect(service.getSync('chinese', 'anilist', '154587')).toBeNull();

    // Seed an unrelated positive hit that must survive the flush.
    await cache.set('title_loc_v2_chinese_anilist_1', { v: '保留我' });

    let notified = 0;
    service.subscribe(() => {
      notified += 1;
    });

    await service.onMappingDataRefreshed();
    expect(notified).toBe(1);
    expect(cache.store.has('title_loc_v2_chinese_anilist_1')).toBe(true);
    expect(service.getSync('chinese', 'anilist', '154587')).toBeUndefined();

    // Re-ensure now succeeds immediately (backoff was cleared too).
    service.ensure('chinese', 'anilist', '154587');
    await settle();
    expect(service.getSync('chinese', 'anilist', '154587')).toBe('葬送的芙莉蓮');
  });
});
