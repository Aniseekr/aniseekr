import { afterEach, describe, expect, it, mock } from 'bun:test';
import { AtlasClient } from '../../../libs/services/pilgrimage/atlas/atlas-client';

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
});
