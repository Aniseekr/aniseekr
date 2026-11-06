import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { ShikimoriProvider } from '../../../libs/services/providers/shikimori-provider';
import { authService } from '../../../libs/services/auth/auth-service';

const originalFetch = globalThis.fetch;
const user = { id: 42, nickname: 'different-name', image: { x160: 'avatar' } };
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe('Shikimori account provider', () => {
  it('reads an empty list with the numeric user id and keeps the existing credentials', async () => {
    const credentials = {
      platform: 'shikimori' as const,
      token: { accessToken: 'valid-token', tokenType: 'Bearer' },
      connectedAt: new Date(),
    };
    const getCredentials = spyOn(authService, 'getCredentials').mockReturnValue(credentials);
    const disconnect = spyOn(authService, 'disconnectPlatform');
    const calls: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return calls.length === 1 ? json(user) : json([]);
    }) as unknown as typeof fetch;

    expect(await new ShikimoriProvider().fetchUserList('valid-token')).toEqual([]);
    expect(calls.map((call) => call.url)).toEqual([
      'https://shikimori.io/api/users/whoami',
      'https://shikimori.io/api/v2/user_rates?user_id=42&target_type=Anime&limit=100&page=1',
    ]);
    expect(calls[1].init?.headers).toMatchObject({
      Authorization: 'Bearer valid-token',
      'User-Agent': 'aniseekr/1.0',
    });
    expect(getCredentials('shikimori')).toBe(credentials);
    expect(disconnect).not.toHaveBeenCalled();
  });

  it('deletes an existing rate and accepts a 204 response', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (calls.length === 1) return json(user);
      if (calls.length === 2) return json([{ id: 77 }]);
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;

    await new ShikimoriProvider().removeFromList('12', 'valid-token');
    expect(calls[1].url).toBe(
      'https://shikimori.io/api/v2/user_rates?user_id=42&target_id=12&target_type=Anime'
    );
    expect(calls[2].url).toBe('https://shikimori.io/api/v2/user_rates/77');
    expect(calls[2].init?.method).toBe('DELETE');
  });

  it('creates a rate with the documented envelope and accepts an empty successful write', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (calls.length === 1 || calls.length === 3) return json(user);
      if (calls.length === 2) return json([]);
      return new Response('', { status: 200 });
    }) as unknown as typeof fetch;
    await new ShikimoriProvider().updateProgress('12', 5, 'valid-token');
    expect(calls[3].url).toBe('https://shikimori.io/api/v2/user_rates');
    expect(calls[3].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[3].init?.body))).toEqual({
      user_rate: { user_id: 42, target_id: '12', target_type: 'Anime', episodes: 5 },
    });
  });

  it('rejects an empty list response body rather than treating it as an empty list', async () => {
    let count = 0;
    globalThis.fetch = mock(async () =>
      ++count === 1 ? json(user) : new Response(null, { status: 204 })
    ) as unknown as typeof fetch;
    await expect(new ShikimoriProvider().fetchUserList('valid-token')).rejects.toThrow(
      'Invalid Shikimori user rates response'
    );
  });

  it('reports an invalid account response when whoami returns null', async () => {
    globalThis.fetch = mock(async () => json(null)) as unknown as typeof fetch;
    await expect(new ShikimoriProvider().fetchUserList('valid-token')).rejects.toThrow(
      'Invalid Shikimori account response'
    );
  });

  it('maps a rate and sends status and score patches to its rate id', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/users/whoami')) return json(user);
      if (!init?.method)
        return json([
          {
            id: 77,
            target_id: 12,
            target_type: 'Anime',
            status: 'on_hold',
            episodes: 3,
            score: 8,
            anime: { name: 'Title', russian: '', episodes: 12, image: { original: '/cover.jpg' } },
          },
        ]);
      return json({});
    }) as unknown as typeof fetch;
    const provider = new ShikimoriProvider();
    expect(await provider.fetchUserList('valid-token')).toMatchObject([
      {
        id: 'shikimori_12',
        title: 'Title',
        imageUrl: 'https://shikimori.io/cover.jpg',
        status: 'on_hold',
        progress: 3,
        score: 8,
      },
    ]);
    await provider.updateStatus('12', 'completed', 'valid-token');
    await provider.updateScore('12', 9, 'valid-token');
    const writes = calls.filter((call) => call.init?.method === 'PATCH');
    expect(writes.map((call) => call.url)).toEqual([
      'https://shikimori.io/api/v2/user_rates/77',
      'https://shikimori.io/api/v2/user_rates/77',
    ]);
    expect(writes.map((call) => JSON.parse(String(call.init?.body)))).toEqual([
      { user_rate: { status: 'completed' } },
      { user_rate: { score: 9 } },
    ]);
  });
});
