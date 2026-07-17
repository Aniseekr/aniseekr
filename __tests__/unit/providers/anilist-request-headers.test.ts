import { afterEach, describe, expect, it, mock } from 'bun:test';
import { AniListAPI } from '../../../libs/clients/anilist-api';
import { AniListProvider } from '../../../libs/services/providers/anilist-provider';

const PRODUCT_USER_AGENT = 'Aniseekr/1.0 (https://github.com/Aniseekr)';
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe('legacy AniList request headers', () => {
  it('AniListAPI overrides the WAF-blocked iOS app User-Agent', async () => {
    const fetchImpl = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ 'User-Agent': PRODUCT_USER_AGENT });
      return new Response(JSON.stringify({ data: { User: { id: 1, name: 'test' } } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    globalThis.fetch = fetchImpl as unknown as typeof fetch;

    await new AniListAPI().getUserProfile('test');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('AniListProvider overrides the WAF-blocked iOS app User-Agent', async () => {
    const fetchImpl = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ 'User-Agent': PRODUCT_USER_AGENT });
      return new Response(
        JSON.stringify({ data: { Viewer: { name: 'test', avatar: { large: 'https://img' } } } }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      );
    });
    globalThis.fetch = fetchImpl as unknown as typeof fetch;

    await new AniListProvider().fetchUserProfile('token');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
