// Deterministic unit tests for AnitabiService.
// Spec cases: PILG-001, PILG-002, PILG-003, PILG-004.

import { afterEach, beforeEach, describe, expect, it, mock, spyOn, test } from 'bun:test';
import { AnitabiClient, DataSourceError } from '../../../libs/clients/anitabi-client';
import type { PilgrimageRow, PilgrimageSaveInput } from '../../../libs/db';
import { LocalDB } from '../../../libs/db';
import { CacheService } from '../../../libs/services/cache-service';
import {
  AnitabiService,
  DETAIL_CACHE_KEY_PREFIX,
  PILGRIMAGE_TTL_MS,
} from '../../../libs/services/pilgrimage/anitabi-service';
import type {
  AnitabiBangumi,
  AnitabiPoint,
  RawAnitabiBangumiPoints,
} from '../../../libs/services/pilgrimage/types';

const SUBJECT_ID = 7157;

const sampleBangumi = (): AnitabiBangumi => ({
  id: SUBJECT_ID,
  cn: '冰菓',
  title: '氷菓',
  city: '岐阜県',
  cover: 'https://image.anitabi.cn/posters/7157.jpg?plan=h160',
  color: '#8DC5D8',
  geo: [35.5, 136.9],
  zoom: 12,
  modified: 1700000000,
  litePoints: [
    {
      id: 'p1',
      name: 'Kamiyama High School',
      cn: '神山高中',
      image: 'https://image.anitabi.cn/scenes/7157/p1.jpg',
      ep: 1,
      s: 90,
      geo: [35.51, 136.91],
    },
  ],
  pointsLength: 5,
  imagesLength: 12,
});

function fakeResponse(status: number, body: unknown): Response {
  const init = {
    status,
    headers: { 'Content-Type': 'application/json' },
  } as ResponseInit;
  return new Response(status === 204 ? null : JSON.stringify(body), init);
}

// Raw GET /bangumi/{id}/points payload — an object wrapping the point list,
// not a bare array. AnitabiService normalises it before caching.
const samplePointsResponse = (): RawAnitabiBangumiPoints => ({
  points: [
    {
      id: 'p1',
      name: 'Kamiyama High School',
      cn: '神山高中',
      image: 'https://image.anitabi.cn/scenes/7157/p1.jpg',
      ep: 1,
      s: 90,
      geo: [35.51, 136.91],
    },
  ],
});

const RELATIVE_LITE = {
  id: 115908,
  cn: '',
  title: '響け！ユーフォニアム',
  city: '宇治市',
  cover: '/images/bangumi/115908.jpg',
  color: '#4a90d9',
  geo: [34.89, 135.8] as [number, number],
  zoom: 12,
  modified: 0,
  pointsLength: 577,
  imagesLength: 500,
  litePoints: [
    {
      id: 'pt1',
      name: '宇治橋',
      image: '/images/points/115908/pt1.jpg',
      ep: 1,
      s: 120,
      geo: [34.9, 135.8] as [number, number],
    },
  ],
};

const noopCache = {
  get: async () => null,
  getWithMeta: async () => null,
  set: async () => undefined,
  delete: async () => undefined,
} as unknown as typeof CacheService;

describe('AnitabiService', () => {
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    await LocalDB.init();
    // Reset SQLite by clearing through cleanExpiredPilgrimage with very high cutoff.
    await LocalDB.cleanExpiredPilgrimage(Number.MAX_SAFE_INTEGER);
    await CacheService.clear();
    fetchSpy = spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    mock.restore();
  });

  it('PILG-001 maps HTTP 404 from getAnimePilgrimage to null', async () => {
    fetchSpy.mockImplementation(async () => fakeResponse(404, { error: 'not found' }));
    const svc = AnitabiService.resetForTests();

    const result = await svc.getAnimePilgrimage(SUBJECT_ID);

    expect(result).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const urls = fetchSpy.mock.calls.map((call: unknown[]) => String(call[0]));
    expect(urls).toEqual([`https://api.anitabi.cn/bangumi/${SUBJECT_ID}/lite`]);
  });

  it('PILG-002 caches the result in memory so a second call does not call fetch', async () => {
    fetchSpy.mockImplementation(async () => fakeResponse(200, sampleBangumi()));
    const svc = AnitabiService.resetForTests();

    const first = await svc.getAnimePilgrimage(SUBJECT_ID);
    const second = await svc.getAnimePilgrimage(SUBJECT_ID);

    expect(first?.title).toBe('氷菓');
    expect(second).toBe(first);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('PILG-002b dedupes concurrent lite calls — single network request', async () => {
    let fetchCount = 0;
    fetchSpy.mockImplementation(async () => {
      fetchCount += 1;
      await new Promise((r) => setTimeout(r, 5));
      return fakeResponse(200, sampleBangumi());
    });
    const svc = AnitabiService.resetForTests();

    const [first, second] = await Promise.all([
      svc.getAnimePilgrimage(SUBJECT_ID),
      svc.getAnimePilgrimage(SUBJECT_ID),
    ]);

    expect(first).toBe(second);
    expect(fetchCount).toBe(1);
  });

  it('PILG-003 persists the lite payload into the SQLite pilgrimage_spots table', async () => {
    fetchSpy.mockImplementation(async () => fakeResponse(200, sampleBangumi()));
    const svc = AnitabiService.resetForTests();

    await svc.getAnimePilgrimage(SUBJECT_ID);

    const row = await LocalDB.getPilgrimage(SUBJECT_ID);
    expect(row).not.toBeNull();
    expect(row?.title).toBe('氷菓');
    expect(row?.title_cn).toBe('冰菓');
    expect(row?.city).toBe('岐阜県');
    expect(row?.points_length).toBe(5);
    expect(row?.lite_points_json).toContain('Kamiyama High School');
    expect(row?.expires_at).toBeGreaterThan(row?.cached_at ?? 0);
  });

  it('PILG-005 getDetailedPoints caches in memory — second call does not refetch', async () => {
    fetchSpy.mockImplementation(async () => fakeResponse(200, samplePointsResponse()));
    const svc = AnitabiService.resetForTests();

    const first = await svc.getDetailedPoints(SUBJECT_ID);
    const second = await svc.getDetailedPoints(SUBJECT_ID);

    expect(first.length).toBe(1);
    expect(second).toBe(first);
    // getDetailedPoints fans out to BOTH /points (complete list) and
    // /points/detail (originURL attribution); the second call is a memory hit.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const urls = fetchSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(urls[0]).toBe(`https://api.anitabi.cn/bangumi/${SUBJECT_ID}/points`);
    expect(
      urls.some((u: string) =>
        u.startsWith(`https://api.anitabi.cn/bangumi/${SUBJECT_ID}/points/detail`)
      )
    ).toBe(true);
  });

  it('PILG-006 getDetailedPoints persists to SQLite — survives a fresh instance', async () => {
    fetchSpy.mockImplementation(async () => fakeResponse(200, samplePointsResponse()));
    const svc1 = AnitabiService.resetForTests();
    await svc1.getDetailedPoints(SUBJECT_ID);
    // cold call fans out to /points + /points/detail
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // New instance forgets in-memory cache; SQLite still has the row.
    const svc2 = AnitabiService.resetForTests();
    const points = await svc2.getDetailedPoints(SUBJECT_ID);
    expect(points.length).toBe(1);
    // svc2 is served entirely from SQLite — no extra network calls.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('PILG-007 getDetailedPoints dedupes concurrent calls — single network request', async () => {
    let fetchCount = 0;
    fetchSpy.mockImplementation(async () => {
      fetchCount += 1;
      // Tiny delay so the second call has time to land while we're "in flight".
      await new Promise((r) => setTimeout(r, 5));
      return fakeResponse(200, samplePointsResponse());
    });
    const svc = AnitabiService.resetForTests();

    const [resA, resB] = await Promise.all([
      svc.getDetailedPoints(SUBJECT_ID),
      svc.getDetailedPoints(SUBJECT_ID),
    ]);

    expect(resA).toBe(resB);
    // concurrent calls dedupe to ONE cold execution, which itself fans out to
    // /points + /points/detail — so 2 network calls, not 4.
    expect(fetchCount).toBe(2);
  });

  it('PILG-008 getDetailedPoints returns [] on 404 and remembers the miss', async () => {
    fetchSpy.mockImplementation(async () => fakeResponse(404, { error: 'not found' }));
    const svc = AnitabiService.resetForTests();

    const first = await svc.getDetailedPoints(SUBJECT_ID);
    const second = await svc.getDetailedPoints(SUBJECT_ID);

    expect(first).toEqual([]);
    expect(second).toEqual([]);
    // cold 404 still probes both endpoints; the miss is then cached in memory.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('PILG-004 refetches once the SQLite row has passed its 7-day TTL', async () => {
    const t0 = 1_700_000_000_000;
    // Each call must return a fresh Response — bodies are single-use streams.
    fetchSpy.mockImplementation(async () => fakeResponse(200, sampleBangumi()));

    // First call at t0 — populates SQLite + memory cache.
    let now = t0;
    const svc = AnitabiService.resetForTests({ now: () => now });
    const first = await svc.getAnimePilgrimage(SUBJECT_ID);
    expect(first?.id).toBe(SUBJECT_ID);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Drop the in-memory cache so SQLite is consulted again.
    svc.invalidate(SUBJECT_ID);

    // Just before TTL boundary — SQLite hit, no extra fetch.
    now = t0 + PILGRIMAGE_TTL_MS - 1;
    const cachedHit = await svc.getAnimePilgrimage(SUBJECT_ID);
    expect(cachedHit?.id).toBe(SUBJECT_ID);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // After TTL — cache invalid; service should refetch.
    svc.invalidate(SUBJECT_ID);
    now = t0 + PILGRIMAGE_TTL_MS + 1_000;
    const refreshed = await svc.getAnimePilgrimage(SUBJECT_ID);
    expect(refreshed?.id).toBe(SUBJECT_ID);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  test('lite payload images are normalized before return and persist', async () => {
    // `as` cast defeats TS narrowing `saved` to the literal `null` type — the
    // assignment only happens inside the `savePilgrimage` closure below, which
    // control-flow analysis can't see executing before the read at the bottom.
    let saved: PilgrimageSaveInput | null = null as PilgrimageSaveInput | null;
    const svc = AnitabiService.resetForTests({
      client: { getLite: async () => ({ ...RELATIVE_LITE }) } as unknown as typeof AnitabiClient,
      db: {
        getPilgrimage: async () => null,
        savePilgrimage: async (row: PilgrimageSaveInput) => {
          saved = row;
        },
      } as unknown as typeof LocalDB,
      cache: noopCache,
    });
    const out = await svc.getAnimePilgrimage(115908);
    expect(out?.litePoints[0]?.image).toBe(
      'https://img-tc.anitabi.cn/points/115908/pt1.jpg?plan=h160'
    );
    expect(out?.cover).toBe('https://img-tc.anitabi.cn/bangumi/115908.jpg?plan=h160');
    expect(saved?.litePointsJson ?? '').toContain(
      'https://img-tc.anitabi.cn/points/115908/pt1.jpg?plan=h160'
    );
  });

  test('rowToBangumi heals invalid website image URLs cached by older builds', async () => {
    const row: PilgrimageRow = {
      bangumi_id: 115908,
      title: '響け！ユーフォニアム',
      title_cn: null,
      city: null,
      cover: 'https://www.anitabi.cn/images/bangumi/115908.jpg?plan=h160',
      color: null,
      center_lat: 34.89,
      center_lng: 135.8,
      zoom: 12,
      points_length: 577,
      images_length: 500,
      lite_points_json: JSON.stringify([
        {
          ...RELATIVE_LITE.litePoints[0],
          image: 'https://www.anitabi.cn/images/points/115908/pt1.jpg?plan=h160',
        },
      ]),
      cached_at: 0,
      expires_at: Number.MAX_SAFE_INTEGER,
    };
    const svc = AnitabiService.resetForTests({
      client: {
        getLite: async () => {
          throw new Error('must not hit network');
        },
      } as unknown as typeof AnitabiClient,
      db: {
        getPilgrimage: async () => row,
        savePilgrimage: async () => undefined,
      } as unknown as typeof LocalDB,
      cache: noopCache,
    });
    const out = await svc.getAnimePilgrimage(115908);
    expect(out?.litePoints[0]?.image).toBe(
      'https://img-tc.anitabi.cn/points/115908/pt1.jpg?plan=h160'
    );
    expect(out?.cover).toBe('https://img-tc.anitabi.cn/bangumi/115908.jpg?plan=h160');
  });

  test('lite: expired SQLite row is served when the network fails', async () => {
    const expiredRow: PilgrimageRow = {
      bangumi_id: 42,
      title: 'Stale Anime',
      title_cn: null,
      city: null,
      cover: 'https://image.anitabi.cn/bangumi/42.jpg?plan=h160',
      color: null,
      center_lat: 1,
      center_lng: 2,
      zoom: 10,
      points_length: 3,
      images_length: 3,
      lite_points_json: '[]',
      cached_at: 0,
      expires_at: 1, // long expired
    };
    const svc = AnitabiService.resetForTests({
      client: {
        getLite: async () => {
          throw new DataSourceError('SERVER_ERROR', 'HTTP 500');
        },
      } as unknown as typeof AnitabiClient,
      db: {
        getPilgrimage: async () => expiredRow,
        savePilgrimage: async () => undefined,
      } as unknown as typeof LocalDB,
      cache: noopCache,
    });
    const out = await svc.getAnimePilgrimage(42);
    expect(out?.title).toBe('Stale Anime');
  });

  test('detail: stale cached points are served when the network fails', async () => {
    const stalePoints = [
      {
        id: 'p1',
        name: '駅前',
        image: 'https://image.anitabi.cn/points/42/p1.jpg?plan=h160',
        ep: 1,
        s: 0,
        geo: [1, 2] as [number, number],
      },
    ];
    const svc = AnitabiService.resetForTests({
      client: {
        getPoints: async () => {
          throw new DataSourceError('SERVER_ERROR', 'HTTP 500');
        },
        getPointsDetail: async () => {
          throw new DataSourceError('SERVER_ERROR', 'HTTP 500');
        },
      } as unknown as typeof AnitabiClient,
      db: {
        getPilgrimage: async () => null,
        savePilgrimage: async () => undefined,
      } as unknown as typeof LocalDB,
      cache: {
        // `get` is kept only for interface compatibility — the production
        // code's stale-if-error path now reads exclusively via `getWithMeta`
        // (a single up-front call, graceMs=0 — the row's own ttl is already
        // widened by the writer, see anitabi-service.ts), so `get` is unused
        // here. Staleness is derived from `age` vs the service's ttlMs
        // (default PILGRIMAGE_TTL_MS here), not from the mock's `isStale`.
        ...noopCache,
        get: async () => null,
        getWithMeta: async () => ({
          value: stalePoints,
          age: PILGRIMAGE_TTL_MS + 1000,
          isStale: true,
        }),
      } as unknown as typeof CacheService,
    });
    const out = await svc.getDetailedPoints(42);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('p1');
  });

  test('lite: a stale-served row does not poison memCache — the next call with a healthy network returns fresh data', async () => {
    const STALE_ID = 990003;
    const expiredRow: PilgrimageRow = {
      bangumi_id: STALE_ID,
      title: 'Old Stale Anime',
      title_cn: null,
      city: null,
      cover: 'https://image.anitabi.cn/bangumi/990003.jpg?plan=h160',
      color: null,
      center_lat: 1,
      center_lng: 2,
      zoom: 10,
      points_length: 3,
      images_length: 3,
      lite_points_json: '[]',
      cached_at: 0,
      expires_at: 1, // long expired
    };
    // A mutable fake so the SAME service instance can see the client
    // "recover" between calls — resetting AnitabiService between calls
    // would trivially get a blank memCache regardless of whether the fix
    // actually avoids memoizing stale serves.
    const client: { getLite: () => Promise<AnitabiBangumi | null> } = {
      getLite: async () => {
        throw new DataSourceError('SERVER_ERROR', 'HTTP 500');
      },
    };
    const svc = AnitabiService.resetForTests({
      client: client as unknown as typeof AnitabiClient,
      // Fake db returns the same expired row on every call — that's fine,
      // it's the memCache poisoning (not the SQLite mock) under test here.
      db: {
        getPilgrimage: async () => expiredRow,
        savePilgrimage: async () => undefined,
      } as unknown as typeof LocalDB,
      cache: noopCache,
    });

    const staleResult = await svc.getAnimePilgrimage(STALE_ID);
    expect(staleResult?.title).toBe('Old Stale Anime');

    client.getLite = async () => ({ ...sampleBangumi(), id: STALE_ID, title: 'Fresh Anime' });
    const freshResult = await svc.getAnimePilgrimage(STALE_ID);
    expect(freshResult?.title).toBe('Fresh Anime');
  });

  test('detail: real CacheService — TTL-expired row survives the widened grace ttl, prune() does not reap it within grace, and a later healthy call returns fresh data (no memCache poisoning)', async () => {
    const REGRESSION_ID = 990001;
    const key = DETAIL_CACHE_KEY_PREFIX + REGRESSION_ID;
    const stalePoints: AnitabiPoint[] = [
      {
        id: 'r1',
        name: '駅前',
        image: 'https://image.anitabi.cn/points/990001/r1.jpg?plan=h160',
        ep: 1,
        s: 0,
        geo: [1, 2],
      },
    ];
    const freshRaw: RawAnitabiBangumiPoints = {
      points: [
        {
          id: 'r2',
          name: '新宿',
          image: 'https://image.anitabi.cn/scenes/990001/r2.jpg',
          ep: 2,
          s: 30,
          geo: [3, 4],
        },
      ],
    };

    // Scaled-down stand-ins for (PILGRIMAGE_TTL_MS, DETAIL_STALE_GRACE_MS) —
    // small enough to sleep past in a test, same shape: the BASE ttl expires
    // quickly, and the WIDENED (base + grace) ttl is what actually guards
    // the row from a boot-time prune().
    const BASE_TTL_MS = 30;
    const GRACE_MS = 300;

    try {
      // Seed the REAL cache with the WIDENED ttl — this is what
      // AnitabiService.getDetailedPoints now writes on a successful fetch
      // (`cache.set(key, fresh, this.ttlMs + DETAIL_STALE_GRACE_MS)`), not
      // the bare base ttl the old version of this test used.
      await CacheService.set(key, stalePoints, BASE_TTL_MS + GRACE_MS);
      // Advance real time past the BASE ttl but still well inside the
      // widened grace window — "app relaunched a few days after the 7-day
      // base TTL but well within the 90-day grace".
      await Bun.sleep(BASE_TTL_MS + 20);

      // I3 regression guard: a boot-time prune (CacheManager.pruneAll() →
      // CacheService.prune(), wired up in app/_layout.tsx) run in this
      // window must NOT delete the row — it's past the base TTL but still
      // inside the widened row ttl. Before this fix, the row was written
      // with the bare base ttl, so this exact prune() call would have
      // deleted it and defeated the stale-if-error grace below.
      const prunedCount = await CacheService.prune();
      expect(prunedCount).toBe(0);
      const survivesPrune = await CacheService.get<AnitabiPoint[]>(key);
      expect(survivesPrune).not.toBeNull();

      // Mutable fake client so the SAME service instance can "recover"
      // between calls (same rationale as the lite no-poisoning test above).
      const client: {
        getPoints: () => Promise<RawAnitabiBangumiPoints | null>;
        getPointsDetail: () => Promise<unknown>;
      } = {
        getPoints: async () => {
          throw new DataSourceError('SERVER_ERROR', 'HTTP 500');
        },
        getPointsDetail: async () => {
          throw new DataSourceError('SERVER_ERROR', 'HTTP 500');
        },
      };
      // ttlMs matches the BASE_TTL_MS used to seed the row above, so the
      // service's own `meta.age > this.ttlMs` staleness check lines up with
      // the "past base TTL, within grace" window we just advanced into.
      const svc = AnitabiService.resetForTests({
        client: client as unknown as typeof AnitabiClient,
        db: {
          getPilgrimage: async () => null,
          savePilgrimage: async () => undefined,
        } as unknown as typeof LocalDB,
        cache: CacheService,
        ttlMs: BASE_TTL_MS,
      });

      // Network fails entirely — the expired-by-base-TTL-but-in-grace row
      // must be served instead of throwing. This is the exact "TTL-expired
      // cache + network outage" scenario the reviewer's probe showed was
      // dead code.
      const staleResult = await svc.getDetailedPoints(REGRESSION_ID);
      expect(staleResult).toHaveLength(1);
      expect(staleResult[0]?.id).toBe('r1');

      // Network recovers — the stale serve above must NOT have been
      // memoized, so this call retries SQLite+network and gets fresh data.
      client.getPoints = async () => freshRaw;
      client.getPointsDetail = async () => [];
      const freshResult = await svc.getDetailedPoints(REGRESSION_ID);
      expect(freshResult).toHaveLength(1);
      expect(freshResult[0]?.id).toBe('r2');
    } finally {
      await CacheService.delete(key);
    }
  });
});
