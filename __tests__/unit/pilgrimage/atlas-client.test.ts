import { afterEach, describe, expect, it, mock } from 'bun:test';
import { AtlasClient } from '../../../libs/services/pilgrimage/atlas/atlas-client';
import type { AtlasWorkDetail, AtlasWorkIndex } from '../../../libs/services/pilgrimage/atlas/types';

describe('Atlas client version handling', () => {
  afterEach(() => mock.restore());

  it('PILG-082 rereads meta once after a versioned asset 404', async () => {
    let metaReads = 0;
    const fetcher = (async (url: string) => {
      if (url.endsWith('/meta.json')) {
        const dataVersion = ++metaReads === 1 ? 'old' : 'new';
        return Response.json({
          dataVersion,
          paths: {
            works: `/v/${dataVersion}/works.json`,
            spotsLite: `/v/${dataVersion}/spots-lite.json`,
            work: `/v/${dataVersion}/works/{key}.json`,
          },
        });
      }
      return url.includes('/old/')
        ? new Response('', { status: 404 })
        : Response.json({ dataVersion: 'new', columns: [], rows: [] });
    }) as unknown as typeof fetch;
    const client = new AtlasClient({ fetcher, cache: null });
    await expect(client.spotsLite()).resolves.toEqual({
      dataVersion: 'new',
      columns: [],
      rows: [],
    });
    expect(metaReads).toBe(2);
  });

  it('PILG-082 resolves moved spot ids and treats null destinations as gone', async () => {
    const requested: string[] = [];
    const client = new AtlasClient({
      fetcher: (async (url: string) => {
        requested.push(url);
        return url.endsWith('/meta.json')
          ? Response.json({
              dataVersion: 'v1',
              paths: {
                works: '/v/v1/works.json',
                spotsLite: '/v/v1/spots-lite.json',
                work: '/v/v1/works/{key}.json',
                moved: '/v/v1/moved-from-meta.json',
              },
            })
          : Response.json({ moved: { old: 'new', gone: null } });
      }) as unknown as typeof fetch,
      cache: null,
    });
    await expect(client.resolveMovedSpot('old')).resolves.toBe('new');
    await expect(client.resolveMovedSpot('gone')).resolves.toBeNull();
    await expect(client.resolveMovedSpot('same')).resolves.toBe('same');
    expect(requested).toContain('https://atlas.aniseekr.moe/v/v1/moved-from-meta.json');
  });

  it('PILG-083 loads city labels and looks them up by municipality code', async () => {
    const requested: string[] = [];
    const client = new AtlasClient({
      fetcher: (async (url: string) => {
        requested.push(url);
        return url.endsWith('/meta.json')
          ? Response.json({
              dataVersion: 'v1',
              paths: {
                works: '/v/v1/works.json',
                spotsLite: '/v/v1/spots-lite.json',
                work: '/v/v1/works/{key}.json',
                cities: '/v/v1/cities.json',
              },
            })
          : Response.json({
              dataVersion: 'v1',
              cities: [
                {
                  muniCd: '19365',
                  pref: '山梨県',
                  name: '身延町',
                  lat: 35.46,
                  lon: 138.44,
                  spots: 244,
                  works: 2,
                },
              ],
            });
      }) as unknown as typeof fetch,
      cache: null,
    });

    const lookup = await client.cityLookup();

    expect(requested).toContain('https://atlas.aniseekr.moe/v/v1/cities.json');
    expect(lookup.get('19365')).toEqual({ pref: '山梨県', name: '身延町' });
  });

  it('PILG-097 loads the exact spot shard path from Atlas metadata', async () => {
    const requested: string[] = [];
    const client = new AtlasClient({
      fetcher: (async (url: string) => {
        requested.push(url);
        return url.endsWith('/meta.json')
          ? Response.json({
              dataVersion: 'v1',
              paths: {
                works: '/v/v1/works.json',
                spotsLite: '/v/v1/spots-lite.json',
                work: '/v/v1/works/{key}.json',
                spotShard: '/v/v1/spots/{shard}.json',
              },
            })
          : Response.json({
              rows: { '01af-c9.8': ['01af-c9.8', 'work', 'Spot', 35, 139, 'c', [1]] },
            });
      }) as unknown as typeof fetch,
      cache: null,
    });

    await expect(client.spotShard('ab')).resolves.toEqual({
      rows: { '01af-c9.8': ['01af-c9.8', 'work', 'Spot', 35, 139, 'c', [1]] },
    });
    expect(requested).toContain('https://atlas.aniseekr.moe/v/v1/spots/ab.json');
  });

  it('PILG-081 serves a cached work after meta expires while offline', async () => {
    const meta = {
      dataVersion: 'v1',
      paths: { works: '/v/v1/works.json', spotsLite: '/v/v1/spots-lite.json', work: '/v/v1/works/{key}.json' },
    };
    const cachedWork: AtlasWorkDetail = {
      dataVersion: 'v1', franchiseKey: 'work', titleJa: '作品', bangumiIds: [], spots: [],
    };
    const values = new Map<string, { value: unknown; timestamp: number; ttl: number }>([
      ['atlas:meta', { value: meta, timestamp: Date.now() - 120_000, ttl: 60_000 }],
      ['atlas:v1:work:work', { value: cachedWork, timestamp: Date.now(), ttl: 7 * 24 * 60 * 60 * 1000 }],
    ]);
    const cache = {
      getSync: <T>(key: string): T | null => {
        const entry = values.get(key);
        return entry && Date.now() - entry.timestamp <= entry.ttl ? entry.value as T : null;
      },
      getSyncWithMeta: <T>(key: string, graceMs = 0) => {
        const entry = values.get(key);
        if (!entry) return null;
        const age = Date.now() - entry.timestamp;
        return age <= entry.ttl + graceMs
          ? { value: entry.value as T, age, isStale: age > entry.ttl }
          : null;
      },
      getWithMeta: async <T>(key: string, graceMs = 0) => {
        const entry = values.get(key);
        if (!entry) return null;
        const age = Date.now() - entry.timestamp;
        return age <= entry.ttl + graceMs
          ? { value: entry.value as T, age, isStale: age > entry.ttl }
          : null;
      },
      set: async (key: string, value: unknown, ttl = 0) => {
        values.set(key, { value, timestamp: Date.now(), ttl });
      },
    };
    const client = new AtlasClient({ fetcher: (() => new Promise<Response>(() => {})) as unknown as typeof fetch, cache });

    await expect(client.work('work')).resolves.toEqual(cachedWork);
  });

  it('PILG-081 returns the cached works index after meta TTL', async () => {
    const meta = {
      dataVersion: 'v1',
      paths: { works: '/v/v1/works.json', spotsLite: '/v/v1/spots-lite.json', work: '/v/v1/works/{key}.json' },
    };
    const cachedWorks: AtlasWorkIndex = {
      dataVersion: 'v1',
      works: [{ key: 'new', ja: '新しい作品', en: null, mal: [], n: 1, conf: { c: 1, s: 0, u: 0 }, cities: [] }],
    };
    const values = new Map<string, { value: unknown; timestamp: number; ttl: number }>([
      ['atlas:meta', { value: meta, timestamp: Date.now() - 120_000, ttl: 60_000 }],
      ['atlas:v1:works', { value: cachedWorks, timestamp: Date.now() - 120_000, ttl: 60_000 }],
    ]);
    const cache = {
      getSync: <T>(key: string): T | null => {
        const entry = values.get(key);
        return entry && Date.now() - entry.timestamp <= entry.ttl ? entry.value as T : null;
      },
      getSyncWithMeta: <T>(key: string, graceMs = 0) => {
        const entry = values.get(key);
        if (!entry) return null;
        const age = Date.now() - entry.timestamp;
        return age <= entry.ttl + graceMs
          ? { value: entry.value as T, age, isStale: age > entry.ttl }
          : null;
      },
      getWithMeta: async <T>(key: string, graceMs = 0) => {
        const entry = values.get(key);
        if (!entry) return null;
        const age = Date.now() - entry.timestamp;
        return age <= entry.ttl + graceMs
          ? { value: entry.value as T, age, isStale: age > entry.ttl }
          : null;
      },
      set: async (key: string, value: unknown, ttl = 0) => {
        values.set(key, { value, timestamp: Date.now(), ttl });
      },
    };
    const client = new AtlasClient({ fetcher: (async () => { throw new Error('offline'); }) as unknown as typeof fetch, cache });

    await expect(client.works()).resolves.toEqual(cachedWorks);
  });
});
