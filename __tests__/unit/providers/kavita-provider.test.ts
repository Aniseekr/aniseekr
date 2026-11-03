import { afterEach, expect, it, mock, spyOn } from 'bun:test';
import { authService } from '../../../libs/services/auth/auth-service';
import { KavitaProvider } from '../../../libs/services/providers/kavita-provider';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

it('uses the Kavita all-v2 filter request to fetch the library', async () => {
  spyOn(authService, 'getCredentials').mockReturnValue({
    platform: 'kavita',
    token: { accessToken: 'api-key', tokenType: 'ApiKey' },
    connectedAt: new Date(),
    serverUrl: 'https://kavita.example',
  });
  let requestUrl = '';
  let requestInit: RequestInit | undefined;
  globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
    requestUrl = String(url);
    requestInit = init;
    return new Response('[]');
  }) as unknown as typeof fetch;

  expect(await new KavitaProvider().fetchUserList('api-key')).toEqual([]);
  expect(requestUrl).toBe('https://kavita.example/api/Series/all-v2?PageNumber=1&PageSize=100');
  expect(requestInit?.method).toBe('POST');
  expect(JSON.parse(String(requestInit?.body))).toEqual({
    statements: [],
    combination: 1,
    limitTo: 0,
  });
  expect(requestInit?.headers).toMatchObject({ 'x-api-key': 'api-key' });
});
