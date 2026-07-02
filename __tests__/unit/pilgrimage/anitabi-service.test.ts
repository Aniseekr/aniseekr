// Deterministic unit tests for AnitabiService.
// Spec cases: PILG-001, PILG-002, PILG-003, PILG-004.

import { afterEach, beforeEach, describe, expect, it, mock, spyOn, test } from 'bun:test';
import { AnitabiClient, DataSourceError } from '../../../libs/clients/anitabi-client';
import type { PilgrimageRow, PilgrimageSaveInput } from '../../../libs/db';
import { LocalDB } from '../../../libs/db';
import { CacheService } from '../../../libs/services/cache-service';
import {
  AnitabiService,
  PILGRIMAGE_TTL_MS,
} from '../../../libs/services/pilgrimage/anitabi-service';
import type {
  AnitabiBangumi,
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
    { id: 'pt1', name: '宇治橋', image: '/images/points/115908/pt1.jpg', ep: 1, s: 120, geo: [34.9, 135.8] as [number, number] },
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
    fetchSpy.mockResolvedValue(fakeResponse(404, { error: 'not found' }));
    const svc = AnitabiService.resetForTests();

    const result = await svc.getAnimePilgrimage(SUBJECT_ID);

    expect(result).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = String((fetchSpy.mock.calls[0] as unknown[])[0]);
    expect(url).toBe(`https://api.anitabi.cn/bangumi/${SUBJECT_ID}/lite`);
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
    fetchSpy.mockResolvedValue(fakeResponse(200, sampleBangumi()));
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
      urls.some((u: string) => u.startsWith(`https://api.anitabi.cn/bangumi/${SUBJECT_ID}/points/detail`))
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
    fetchSpy.mockResolvedValue(fakeResponse(404, { error: 'not found' }));
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
        savePilgrimage: async (row: PilgrimageSaveInput) => { saved = row; },
      } as unknown as typeof LocalDB,
      cache: noopCache,
    });
    const out = await svc.getAnimePilgrimage(115908);
    expect(out?.litePoints[0]?.image).toBe('https://image.anitabi.cn/points/115908/pt1.jpg?plan=h160');
    expect(out?.cover).toBe('https://image.anitabi.cn/bangumi/115908.jpg?plan=h160');
    expect(saved?.litePointsJson ?? '').toContain('https://image.anitabi.cn/points/115908/pt1.jpg?plan=h160');
  });

  test('rowToBangumi heals relative paths cached by older builds (no cache-bust needed)', async () => {
    const row: PilgrimageRow = {
      bangumi_id: 115908,
      title: '響け！ユーフォニアム',
      title_cn: null,
      city: null,
      cover: '/images/bangumi/115908.jpg',
      color: null,
      center_lat: 34.89,
      center_lng: 135.8,
      zoom: 12,
      points_length: 577,
      images_length: 500,
      lite_points_json: JSON.stringify(RELATIVE_LITE.litePoints),
      cached_at: 0,
      expires_at: Number.MAX_SAFE_INTEGER,
    };
    const svc = AnitabiService.resetForTests({
      client: { getLite: async () => { throw new Error('must not hit network'); } } as unknown as typeof AnitabiClient,
      db: { getPilgrimage: async () => row, savePilgrimage: async () => undefined } as unknown as typeof LocalDB,
      cache: noopCache,
    });
    const out = await svc.getAnimePilgrimage(115908);
    expect(out?.litePoints[0]?.image).toBe('https://image.anitabi.cn/points/115908/pt1.jpg?plan=h160');
    expect(out?.cover).toBe('https://image.anitabi.cn/bangumi/115908.jpg?plan=h160');
  });

  test('lite: expired SQLite row is served when the network fails', async () => {
    const expiredRow: PilgrimageRow = {
      bangumi_id: 42,
      title: 'Stale Anime',
      title_cn: null, city: null,
      cover: 'https://image.anitabi.cn/bangumi/42.jpg?plan=h160',
      color: null, center_lat: 1, center_lng: 2, zoom: 10,
      points_length: 3, images_length: 3,
      lite_points_json: '[]',
      cached_at: 0,
      expires_at: 1, // long expired
    };
    const svc = AnitabiService.resetForTests({
      client: {
        getLite: async () => { throw new DataSourceError('SERVER_ERROR', 'HTTP 500'); },
      } as unknown as typeof AnitabiClient,
      db: { getPilgrimage: async () => expiredRow, savePilgrimage: async () => undefined } as unknown as typeof LocalDB,
      cache: noopCache,
    });
    const out = await svc.getAnimePilgrimage(42);
    expect(out?.title).toBe('Stale Anime');
  });

  test('detail: stale cached points are served when the network fails', async () => {
    const stalePoints = [
      { id: 'p1', name: '駅前', image: 'https://image.anitabi.cn/points/42/p1.jpg?plan=h160', ep: 1, s: 0, geo: [1, 2] as [number, number] },
    ];
    const svc = AnitabiService.resetForTests({
      client: {
        getPoints: async () => { throw new DataSourceError('SERVER_ERROR', 'HTTP 500'); },
        getPointsDetail: async () => { throw new DataSourceError('SERVER_ERROR', 'HTTP 500'); },
      } as unknown as typeof AnitabiClient,
      db: { getPilgrimage: async () => null, savePilgrimage: async () => undefined } as unknown as typeof LocalDB,
      cache: {
        ...noopCache,
        get: async () => null, // fresh read misses (expired)
        getWithMeta: async (_k: string, graceMs: number) =>
          graceMs > 0 ? { value: stalePoints, isStale: true } : null,
      } as unknown as typeof CacheService,
    });
    const out = await svc.getDetailedPoints(42);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('p1');
  });
});
