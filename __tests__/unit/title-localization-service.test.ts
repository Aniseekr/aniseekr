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
  };
}

/** ensure() is fire-and-forget; drain its queue before asserting. */
async function settle(rounds = 10) {
  for (let i = 0; i < rounds; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('TitleLocalizationService', () => {
  it('TLS-001 resolves a Chinese title through the ID mapping and caches it', async () => {
    const cache = makeFakeCache();
    let fetchCalls = 0;
    const service = new TitleLocalizationService({
      cache,
      idMapping: {
        mapID: async (from, fromId, to) =>
          from === 'anilist' && String(fromId) === '16498' && to === 'bangumi' ? '23686' : null,
      },
      fetchers: {
        chinese: async (bangumiId) => {
          fetchCalls += 1;
          expect(bangumiId).toBe('23686');
          return '进击的巨人';
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

    expect(service.getSync('chinese', 'anilist', '16498')).toBe('进击的巨人');
    expect(fetchCalls).toBe(1);
    expect(notified).toBe(1);

    // Cached → ensure is a no-op.
    service.ensure('chinese', 'anilist', '16498');
    await settle();
    expect(fetchCalls).toBe(1);
  });

  it('TLS-002 caches a negative result when no mapping exists', async () => {
    const cache = makeFakeCache();
    let fetchCalls = 0;
    const service = new TitleLocalizationService({
      cache,
      idMapping: { mapID: async () => null },
      fetchers: {
        chinese: async () => {
          fetchCalls += 1;
          return 'should not be called';
        },
      },
    });

    service.ensure('chinese', 'anilist', '999999');
    await settle();

    // null = known-absent (≠ undefined/unknown) → render fallback, no re-probe.
    expect(service.getSync('chinese', 'anilist', '999999')).toBeNull();
    expect(fetchCalls).toBe(0);

    service.ensure('chinese', 'anilist', '999999');
    await settle();
    expect(fetchCalls).toBe(0);
  });

  it('TLS-003 caches a negative result when the source has no localized title', async () => {
    const cache = makeFakeCache();
    const service = new TitleLocalizationService({
      cache,
      idMapping: { mapID: async () => '42' },
      fetchers: { russian: async () => null },
    });

    service.ensure('russian', 'anilist', '1');
    await settle();
    expect(service.getSync('russian', 'anilist', '1')).toBeNull();
  });

  it('TLS-004 dedupes concurrent ensure calls for the same key', async () => {
    const cache = makeFakeCache();
    let fetchCalls = 0;
    const service = new TitleLocalizationService({
      cache,
      idMapping: { mapID: async () => '23686' },
      fetchers: {
        chinese: async () => {
          fetchCalls += 1;
          await new Promise((resolve) => setTimeout(resolve, 5));
          return '冰菓';
        },
      },
    });

    service.ensure('chinese', 'anilist', '12189');
    service.ensure('chinese', 'anilist', '12189');
    service.ensure('chinese', 'anilist', '12189');
    await settle(20);

    expect(fetchCalls).toBe(1);
    expect(service.getSync('chinese', 'anilist', '12189')).toBe('冰菓');
  });

  it('TLS-005 a failed fetch is not cached and backs off instead of hammering', async () => {
    const cache = makeFakeCache();
    let fetchCalls = 0;
    const service = new TitleLocalizationService({
      cache,
      idMapping: { mapID: async () => '23686' },
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

    // Within the backoff window the retry is suppressed.
    service.ensure('chinese', 'anilist', '16498');
    await settle();
    expect(fetchCalls).toBe(1);
  });
});
