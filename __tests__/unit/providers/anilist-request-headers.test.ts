import { afterEach, describe, expect, it, mock } from 'bun:test';
import { AniListAPI } from '../../../libs/clients/anilist-api';
import { AniListProvider } from '../../../libs/services/providers/anilist-provider';

const PRODUCT_USER_AGENT = 'Aniseekr/1.0 (https://github.com/Aniseekr)';
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe('AniList list removal', () => {
  it('looks up the list entry and deletes using its ID', async () => {
    const requests: { query: string; variables: Record<string, unknown> }[] = [];
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      requests.push(JSON.parse(init!.body as string));
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer token' });
      return new Response(
        JSON.stringify({
          data:
            requests.length === 1
              ? { Media: { mediaListEntry: { id: 987 } } }
              : { DeleteMediaListEntry: { deleted: true } },
        })
      );
    }) as unknown as typeof fetch;
    await new AniListProvider().removeFromList('123', 'token');
    expect(requests[0].variables).toEqual({ mediaId: 123 });
    expect(requests[0].query).toContain('mediaListEntry');
    expect(requests[1].variables).toEqual({ id: 987 });
    expect(requests[1].query).toContain('DeleteMediaListEntry(id: $id)');
  });

  it('treats a missing list entry as already removed', async () => {
    const fetchImpl = mock(
      async () => new Response(JSON.stringify({ data: { Media: { mediaListEntry: null } } }))
    );
    globalThis.fetch = fetchImpl as unknown as typeof fetch;
    await new AniListProvider().removeFromList('123', 'token');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('propagates a failed deletion for retry', async () => {
    let calls = 0;
    globalThis.fetch = mock(
      async () =>
        new Response(
          JSON.stringify({
            data:
              ++calls === 1
                ? { Media: { mediaListEntry: { id: 987 } } }
                : { DeleteMediaListEntry: { deleted: false } },
          })
        )
    ) as unknown as typeof fetch;
    await expect(new AniListProvider().removeFromList('123', 'token')).rejects.toThrow(
      'deletion failed'
    );
  });
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
