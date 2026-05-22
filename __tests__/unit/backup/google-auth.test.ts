import { describe, it, expect, beforeEach, mock } from 'bun:test';

import {
  GoogleCredentialStore,
  type GoogleCredentials,
  type SecureStorageLike,
} from '../../../libs/services/backup/google-auth';

function makeFakeSecureStore(): SecureStorageLike & { _store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    _store: store,
    async getItemAsync(k) {
      return store.get(k) ?? null;
    },
    async setItemAsync(k, v) {
      store.set(k, v);
    },
    async deleteItemAsync(k) {
      store.delete(k);
    },
  };
}

describe('backup/google-auth · credential store', () => {
  let secure: ReturnType<typeof makeFakeSecureStore>;
  let store: GoogleCredentialStore;

  beforeEach(() => {
    secure = makeFakeSecureStore();
    store = new GoogleCredentialStore({ storage: secure });
  });

  it('GOOGLE-001 load returns null when nothing is saved', async () => {
    expect(await store.load()).toBeNull();
  });

  it('GOOGLE-002 save then load round-trips credentials', async () => {
    const creds: GoogleCredentials = {
      accessToken: 'ya29.abc',
      refreshToken: 'r/xyz',
      expiresAt: 1_900_000_000_000,
      scope: 'https://www.googleapis.com/auth/drive.appdata',
      tokenType: 'Bearer',
    };
    await store.save(creds);
    expect(await store.load()).toEqual(creds);
  });

  it('GOOGLE-003 clear removes the saved credentials', async () => {
    await store.save({ accessToken: 't', refreshToken: null, expiresAt: 0 });
    await store.clear();
    expect(await store.load()).toBeNull();
  });

  it('GOOGLE-004 isExpired flags credentials that are past expiry (with a 60s skew)', () => {
    const now = 1_700_000_000_000;
    expect(store.isExpired({ accessToken: 't', refreshToken: null, expiresAt: now - 1 }, now)).toBe(true);
    expect(store.isExpired({ accessToken: 't', refreshToken: null, expiresAt: now + 30_000 }, now)).toBe(true); // within skew
    expect(store.isExpired({ accessToken: 't', refreshToken: null, expiresAt: now + 120_000 }, now)).toBe(false);
  });

  it('GOOGLE-005 load tolerates a malformed payload (corrupted SecureStore) without throwing', async () => {
    await secure.setItemAsync('aniseekr.cloud.google.credentials.v1', 'not json');
    expect(await store.load()).toBeNull();
  });
});

describe('backup/google-auth · refreshAccessToken', () => {
  it('GOOGLE-100 posts refresh_token grant and returns a fresh access token', async () => {
    const fetchCalls: { url: string; init?: RequestInit }[] = [];
    const fakeFetch = mock(async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url, init });
      return new Response(
        JSON.stringify({ access_token: 'ya29.new', expires_in: 3600, scope: 'drive.appdata' }),
        { status: 200 }
      );
    });

    const { refreshAccessToken } = await import('../../../libs/services/backup/google-auth');
    const result = await refreshAccessToken(
      { clientId: 'my-client.apps.googleusercontent.com', refreshToken: 'r/xyz' },
      { fetchImpl: fakeFetch as unknown as typeof fetch, now: () => 1_700_000_000_000 }
    );

    expect(result.accessToken).toBe('ya29.new');
    expect(result.refreshToken).toBe('r/xyz');
    expect(result.expiresAt).toBeGreaterThan(1_700_000_000_000);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]?.url).toContain('https://oauth2.googleapis.com/token');
    expect(String(fetchCalls[0]?.init?.body)).toContain('grant_type=refresh_token');
  });

  it('GOOGLE-101 surfaces a meaningful error when Google rejects the refresh token', async () => {
    const fakeFetch = mock(
      async () =>
        new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Bad token' }), {
          status: 400,
        })
    );
    const { refreshAccessToken } = await import('../../../libs/services/backup/google-auth');
    await expect(
      refreshAccessToken(
        { clientId: 'cid', refreshToken: 'r/xyz' },
        { fetchImpl: fakeFetch as unknown as typeof fetch }
      )
    ).rejects.toThrow(/invalid_grant|Bad token/);
  });
});
