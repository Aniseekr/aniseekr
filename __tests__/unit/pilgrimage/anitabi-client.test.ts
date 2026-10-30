import { beforeEach, describe, expect, it, mock } from 'bun:test';

import { AnitabiClient } from '../../../libs/clients/anitabi-client';
import { rateLimiter } from '../../../libs/services/rate-limiter';

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

// Regression for anitabi/anitabi.cn-document#94: requests outside api.md put
// the caller's IP on Cloudflare risk control, so the client must only ever
// touch the documented paths and must stop (not try other URLs) on 403.
describe('AnitabiClient documented API surface', () => {
  beforeEach(() => {
    AnitabiClient.resetForTests();
    rateLimiter.reset();
  });

  it('PILG-018 requests only documented endpoints with honest headers', async () => {
    const fetchMock = mock(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/lite')) return Response.json(apiLite);
      if (url.includes('/points/detail')) return Response.json([]);
      throw new Error(`unexpected request: ${url}`);
    });
    const fetchImpl = fetchMock as unknown as typeof fetch;

    const lite = await AnitabiClient.getLite(7157, { fetchImpl });
    const detail = await AnitabiClient.getPointsDetail(7157, { fetchImpl });

    expect(lite?.cover).toBe('https://image.anitabi.cn/bangumi/7157.jpg?plan=h160');
    expect(detail).toEqual([]);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.anitabi.cn/bangumi/7157/lite',
      'https://api.anitabi.cn/bangumi/7157/points/detail?haveImage=true',
    ]);
    for (const [, init] of fetchMock.mock.calls as unknown as [string, RequestInit][]) {
      const headers = init.headers as Record<string, string>;
      expect(headers.Referer).toBeUndefined();
      expect(headers['User-Agent']).toContain('https://aniseekr.moe');
    }
  });

  it('PILG-018 backs off after HTTP 403 without requesting any other URL', async () => {
    const fetchMock = mock(async () => Response.json({ error: 'forbidden' }, { status: 403 }));
    const fetchImpl = fetchMock as unknown as typeof fetch;

    await expect(AnitabiClient.getLite(7157, { fetchImpl })).rejects.toMatchObject({ status: 403 });
    await expect(AnitabiClient.getPointsDetail(7157, { fetchImpl })).rejects.toMatchObject({
      status: 403,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps 404 to null and other failures to typed errors', async () => {
    for (const [status, code] of [
      [404, null],
      [429, 'RATE_LIMITED'],
      [500, 'SERVER_ERROR'],
    ] as const) {
      const fetchImpl = mock(async () =>
        Response.json({ error: 'failure' }, { status })
      ) as unknown as typeof fetch;
      if (code === null) {
        expect(await AnitabiClient.getLite(7157, { fetchImpl })).toBeNull();
      } else {
        await expect(AnitabiClient.getLite(7157, { fetchImpl })).rejects.toMatchObject({ code });
      }
    }
  });
});
