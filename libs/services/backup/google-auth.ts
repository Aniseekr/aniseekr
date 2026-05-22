// Google Drive OAuth helper for the backup feature on Android.
//
// The React hook flow (expo-auth-session/providers/google) lives in the UI
// layer; this file owns the *plumbing*: persisting credentials to SecureStore,
// expiry tracking, and refreshing the access token when it's stale.
//
// Token lifetime is short (~1h) but Google issues a refresh_token alongside
// when `access_type=offline` + `prompt=consent` are set, so we can renew
// silently when the user reopens the app the next day.

export const GOOGLE_DRIVE_APP_DATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const GOOGLE_DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SECURE_KEY = 'aniseekr.cloud.google.credentials.v1';
const EXPIRY_SKEW_MS = 60_000; // treat tokens expiring within 60s as already-expired

export interface GoogleCredentials {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number; // ms epoch
  scope?: string;
  tokenType?: string;
}

export interface SecureStorageLike {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export interface GoogleCredentialStoreOptions {
  storage: SecureStorageLike;
  storageKey?: string;
}

export class GoogleCredentialStore {
  private readonly storage: SecureStorageLike;
  private readonly key: string;

  constructor(opts: GoogleCredentialStoreOptions) {
    this.storage = opts.storage;
    this.key = opts.storageKey ?? SECURE_KEY;
  }

  async load(): Promise<GoogleCredentials | null> {
    try {
      const raw = await this.storage.getItemAsync(this.key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<GoogleCredentials>;
      if (
        !parsed ||
        typeof parsed.accessToken !== 'string' ||
        typeof parsed.expiresAt !== 'number'
      ) {
        return null;
      }
      return {
        accessToken: parsed.accessToken,
        refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : null,
        expiresAt: parsed.expiresAt,
        scope: typeof parsed.scope === 'string' ? parsed.scope : undefined,
        tokenType: typeof parsed.tokenType === 'string' ? parsed.tokenType : undefined,
      };
    } catch {
      return null;
    }
  }

  async save(creds: GoogleCredentials): Promise<void> {
    await this.storage.setItemAsync(this.key, JSON.stringify(creds));
  }

  async clear(): Promise<void> {
    await this.storage.deleteItemAsync(this.key);
  }

  isExpired(creds: GoogleCredentials, now: number = Date.now()): boolean {
    return creds.expiresAt - EXPIRY_SKEW_MS <= now;
  }
}

export interface RefreshTokenInput {
  clientId: string;
  refreshToken: string;
}

export interface RefreshOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  endpoint?: string;
}

export async function refreshAccessToken(
  input: RefreshTokenInput,
  options: RefreshOptions = {}
): Promise<GoogleCredentials> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const endpoint = options.endpoint ?? 'https://oauth2.googleapis.com/token';

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: input.clientId,
    refresh_token: input.refreshToken,
  });

  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // leave as-is
  }

  if (!res.ok) {
    const errCode = typeof parsed.error === 'string' ? parsed.error : `HTTP ${res.status}`;
    const errDesc =
      typeof parsed.error_description === 'string' ? parsed.error_description : text || 'unknown';
    throw new Error(`Google refresh failed: ${errCode}: ${errDesc}`);
  }

  const accessToken = typeof parsed.access_token === 'string' ? parsed.access_token : '';
  const expiresIn =
    typeof parsed.expires_in === 'number' && Number.isFinite(parsed.expires_in)
      ? parsed.expires_in
      : 3600;
  if (!accessToken) {
    throw new Error('Google refresh failed: missing access_token in response');
  }

  return {
    accessToken,
    refreshToken: input.refreshToken,
    expiresAt: now() + expiresIn * 1000,
    scope: typeof parsed.scope === 'string' ? parsed.scope : undefined,
    tokenType: typeof parsed.token_type === 'string' ? parsed.token_type : 'Bearer',
  };
}

export function createGoogleCredentialStore(): GoogleCredentialStore {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SecureStore = require('expo-secure-store') as SecureStorageLike;
  return new GoogleCredentialStore({ storage: SecureStore });
}
