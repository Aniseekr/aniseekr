import { beforeEach, describe, expect, it, mock } from 'bun:test';

import { AnitabiClient } from '../../../libs/clients/anitabi-client';
import { AnitabiStaticClient } from '../../../libs/clients/anitabi-static-client';

const catalogPayload = [
  [
    [
      7157,
      '缘之空',
      'Yosuga no Sora',
      'ヨスガノソラ',
      '足利市',
      '#1c398e',
      '/images/bangumi/7157.jpg',
      6.5,
      '游戏',
      36.364616,
      139.494498,
      12.1,
      ['point-a', 36.361787, 139.49489, 5],
    ],
  ],
  250,
  1_784_017_364_302,
];

const pagePayload = [
  [
    7157,
    [],
    [
      [
        'point-a',
        '樺崎八幡宮',
        '桦崎八幡宫',
        0,
        0,
        12,
        '/images/points/7157/point-a.jpg',
        0,
        3,
        120,
        '',
        'Google Maps',
        'https://maps.example/point-a',
        0,
        5,
      ],
    ],
    1_784_017_364_303,
  ],
];

const apiLite = {
  id: 7157,
  cn: '缘之空',
  title: 'ヨスガノソラ',
  city: '足利市',
  cover: '/images/bangumi/7157.jpg',
  color: '#1c398e',
  geo: [36.364616, 139.494498],
  zoom: 12.1,
  modified: 1_784_017_364_303,
  litePoints: [],
  pointsLength: 1,
  imagesLength: 1,
};

describe('AnitabiClient API-first fallback', () => {
  beforeEach(() => {
    AnitabiStaticClient.resetCacheForTests();
  });

  it('uses successful API responses without requesting the www static files', async () => {
    const fetchMock = mock(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/lite')) return Response.json(apiLite);
      if (url.includes('/points/detail')) return Response.json([]);
      if (url.endsWith('/points')) return Response.json({ points: [] });
      throw new Error(`unexpected request: ${url}`);
    });
    const fetchImpl = fetchMock as unknown as typeof fetch;

    const [lite, points, detail] = await Promise.all([
      AnitabiClient.getLite(7157, { fetchImpl }),
      AnitabiClient.getPoints(7157, { fetchImpl }),
      AnitabiClient.getPointsDetail(7157, { fetchImpl }),
    ]);

    expect(lite?.id).toBe(7157);
    expect(lite?.cover).toBe('https://img-tc.anitabi.cn/bangumi/7157.jpg?plan=h160');
    expect(points).toEqual({ points: [] });
    expect(detail).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      fetchMock.mock.calls.every(([url]) => String(url).startsWith('https://api.anitabi.cn/'))
    ).toBe(true);
  });

  it('falls back to www only after API HTTP 403 and deduplicates static page loads', async () => {
    const fetchMock = mock(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith('https://api.anitabi.cn/')) {
        return Response.json({ error: 'forbidden' }, { status: 403 });
      }
      if (url.endsWith('/d/g.json')) return Response.json(catalogPayload);
      if (url.endsWith('/d/g0.json')) return Response.json(pagePayload);
      throw new Error(`unexpected request: ${url}`);
    });
    const fetchImpl = fetchMock as unknown as typeof fetch;

    const [lite, points, detail] = await Promise.all([
      AnitabiClient.getLite(7157, { fetchImpl }),
      AnitabiClient.getPoints(7157, { fetchImpl }),
      AnitabiClient.getPointsDetail(7157, { fetchImpl }),
    ]);

    expect(lite).toMatchObject({ id: 7157, title: 'ヨスガノソラ', pointsLength: 1 });
    expect(points?.points?.[0]).toMatchObject({
      id: 'point-a',
      geo: [36.361787, 139.49489],
    });
    expect(detail?.[0]).toMatchObject({
      id: 'point-a',
      originURL: 'https://maps.example/point-a',
    });
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.filter((url) => url.startsWith('https://api.anitabi.cn/'))).toHaveLength(3);
    expect(urls.filter((url) => url === 'https://www.anitabi.cn/d/g.json')).toHaveLength(1);
    expect(urls.filter((url) => url === 'https://www.anitabi.cn/d/g0.json')).toHaveLength(1);
  });

  it('does not use www for non-403 API statuses', async () => {
    for (const [status, code] of [
      [404, null],
      [429, 'RATE_LIMITED'],
      [500, 'SERVER_ERROR'],
    ] as const) {
      const fetchMock = mock(async () => Response.json({ error: 'failure' }, { status }));
      const fetchImpl = fetchMock as unknown as typeof fetch;

      if (code === null) {
        expect(await AnitabiClient.getLite(7157, { fetchImpl })).toBeNull();
      } else {
        await expect(AnitabiClient.getLite(7157, { fetchImpl })).rejects.toMatchObject({ code });
      }
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it('does not use www for API decoding or network failures', async () => {
    const invalidJson = mock(async () => new Response('not-json'));
    await expect(
      AnitabiClient.getLite(7157, { fetchImpl: invalidJson as unknown as typeof fetch })
    ).rejects.toMatchObject({ code: 'DECODING_ERROR' });
    expect(invalidJson).toHaveBeenCalledTimes(1);

    const networkFailure = mock(async () => {
      throw new Error('offline');
    });
    await expect(
      AnitabiClient.getLite(7157, { fetchImpl: networkFailure as unknown as typeof fetch })
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(networkFailure).toHaveBeenCalledTimes(1);
  });
});
